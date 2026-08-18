import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@12.0.0?target=deno';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * verify-subscription
 * Called from the SubscriptionSuccess page after Stripe Checkout redirect.
 * It retrieves the Checkout Session from Stripe, extracts subscription details,
 * and updates the organization record in Supabase — ensuring the local DB
 * is always in sync even if the webhook hasn't fired yet.
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    // Authenticate the user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Unauthorized');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') || '',
      Deno.env.get('SUPABASE_ANON_KEY') || '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) throw new Error('Unauthorized');

    const { session_id } = await req.json();
    if (!session_id) throw new Error('session_id is required');

    // Init Stripe
    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
      apiVersion: '2022-11-15',
      httpClient: Stripe.createFetchHttpClient(),
    });

    // Retrieve the Checkout Session with subscription expanded
    const session = await stripe.checkout.sessions.retrieve(session_id, {
      expand: ['subscription'],
    });

    if (!session) throw new Error('Checkout session not found');
    if (session.status !== 'complete') {
      return new Response(JSON.stringify({ 
        verified: false, 
        reason: `Session status is "${session.status}", not complete.` 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const subscription = session.subscription as any;
    if (!subscription) {
      return new Response(JSON.stringify({ 
        verified: false, 
        reason: 'No subscription found in checkout session.' 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Extract data from the subscription
    const metadataOrgId = subscription.metadata?.organization_id || session.metadata?.organization_id;
    const planId = subscription.metadata?.plan_id || 'pro';
    const status = subscription.status; // 'trialing', 'active', etc.
    const periodEnd = new Date(subscription.current_period_end * 1000).toISOString();
    const trialEnd = subscription.trial_end 
      ? new Date(subscription.trial_end * 1000).toISOString() 
      : null;
    const cancelAtPeriodEnd = subscription.cancel_at_period_end || false;
    const customerId = subscription.customer as string;

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') || '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    );

    // CRITICAL: Always find the user's PRIMARY organization (oldest one, which has their data)
    // Do NOT blindly trust metadata org_id — it might point to a duplicate empty org.
    let orgId = metadataOrgId;

    // Find the user's oldest (primary) organization — the one that actually has data
    const { data: primaryMembership } = await supabaseAdmin
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
      .order('joined_at', { ascending: true })
      .limit(1)
      .single();

    if (primaryMembership) {
      orgId = primaryMembership.organization_id;
    }

    if (!orgId) {
      // Last resort fallback: look up by stripe customer ID
      const { data: org } = await supabaseAdmin
        .from('organizations')
        .select('id')
        .eq('stripe_customer_id', customerId)
        .single();

      if (!org) throw new Error('Organization not found for this customer');
      orgId = org.id;
    }

    // Update the organization with subscription data
    const { error: updateError } = await supabaseAdmin
      .from('organizations')
      .update({
        subscription_status: status,
        plan_id: planId,
        current_period_end: trialEnd || periodEnd,
        cancel_at_period_end: cancelAtPeriodEnd,
        stripe_customer_id: customerId,
        stripe_subscription_id: subscription.id,
      })
      .eq('id', orgId);

    if (updateError) {
      console.error('Error updating organization:', updateError);
      throw new Error('Failed to update organization: ' + updateError.message);
    }

    // Ensure profile points to the correct org (in case it was changed during checkout)
    await supabaseAdmin
      .from('profiles')
      .update({ 
        onboarding_completed: true,
        current_organization_id: orgId
      })
      .eq('id', user.id);

    console.log(`✅ Subscription verified for org ${orgId}: ${status} / ${planId}`);

    return new Response(JSON.stringify({ 
      verified: true,
      status,
      plan_id: planId,
      period_end: trialEnd || periodEnd,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('verify-subscription error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
