import React, { useRef, useEffect, useCallback, useState } from 'react';
import DOMPurify from 'dompurify';
import { Button } from '@/components/ui/button';
import {
    Bold,
    Italic,
    Underline,
    AlignLeft,
    AlignCenter,
    AlignRight,
    AlignJustify,
    List,
    ListOrdered,
    RemoveFormatting,
    Type,
    Palette,
} from 'lucide-react';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

interface RichConsentEditorProps {
    value: string;
    onChange: (html: string) => void;
    placeholder?: string;
    className?: string;
    readOnly?: boolean;
}

const FONTS = [
    { label: 'Predeterminada (Inter)', value: 'Inter, sans-serif' },
    { label: 'Arial (Limpia)', value: 'Arial, sans-serif' },
    { label: 'Times New Roman (Formal)', value: '"Times New Roman", Times, serif' },
    { label: 'Georgia (Elegante)', value: 'Georgia, serif' },
    { label: 'Courier New (Legal)', value: '"Courier New", Courier, monospace' },
];

const FONT_SIZES = [
    { label: '12px (Pequeña)', value: '1', cssSize: '12px' },
    { label: '14px (Normal)', value: '2', cssSize: '14px' },
    { label: '16px (Mediana)', value: '3', cssSize: '16px' },
    { label: '18px (Grande)', value: '4', cssSize: '18px' },
    { label: '22px (Encabezado)', value: '5', cssSize: '22px' },
];

const COLORS = [
    { label: 'Negro Clásico', color: '#111827' },
    { label: 'Gris Clínico', color: '#4b5563' },
    { label: 'Azul Institucional', color: '#1e40af' },
    { label: 'Verde Esmeralda', color: '#047857' },
    { label: 'Rojo / Borgoña', color: '#991b1b' },
    { label: 'Púrpura Terapéutico', color: '#6b21a8' },
];

export const RichConsentEditor: React.FC<RichConsentEditorProps> = ({
    value,
    onChange,
    placeholder = 'Escribe o pega el texto del consentimiento aquí...',
    className,
    readOnly = false,
}) => {
    const editorRef = useRef<HTMLDivElement>(null);
    const [selectedFont, setSelectedFont] = useState('Inter, sans-serif');
    const [selectedSize, setSelectedSize] = useState('2');
    const [selectedColor, setSelectedColor] = useState('#111827');
    const isInternalUpdate = useRef(false);

    // Convert plain text with newlines to HTML paragraphs if needed
    const formatInitialHtml = useCallback((text: string) => {
        if (!text) return '<p><br></p>';
        if (text.trim().startsWith('<') && text.trim().endsWith('>')) {
            return text;
        }
        return text
            .split('\n\n')
            .map((p) => `<p style="margin-bottom: 0.75rem;">${p.split('\n').join('<br>')}</p>`)
            .join('');
    }, []);

    // Sync external value changes into editor
    useEffect(() => {
        if (!editorRef.current) return;
        if (isInternalUpdate.current) {
            isInternalUpdate.current = false;
            return;
        }
        const formatted = formatInitialHtml(value);
        if (editorRef.current.innerHTML !== formatted) {
            editorRef.current.innerHTML = DOMPurify.sanitize(formatted, {
                ADD_ATTR: ['style'],
            });
        }
    }, [value, formatInitialHtml]);

    const handleContentChange = useCallback(() => {
        if (!editorRef.current) return;
        isInternalUpdate.current = true;
        const html = editorRef.current.innerHTML;
        onChange(html);
    }, [onChange]);

    const exec = useCallback((command: string, value: string | undefined = undefined) => {
        if (readOnly) return;
        editorRef.current?.focus();
        document.execCommand(command, false, value);
        handleContentChange();
    }, [readOnly, handleContentChange]);

    const applyFont = (fontValue: string) => {
        setSelectedFont(fontValue);
        exec('fontName', fontValue);
    };

    const applySize = (sizeValue: string) => {
        setSelectedSize(sizeValue);
        exec('fontSize', sizeValue);
    };

    const applyColor = (colorValue: string) => {
        setSelectedColor(colorValue);
        exec('foreColor', colorValue);
    };

    return (
        <div className={cn("border border-border rounded-2xl bg-card overflow-hidden shadow-xs", className)}>
            {!readOnly && (
                <div className="flex flex-wrap items-center gap-1.5 p-2 bg-muted/30 border-b border-border/60">
                    {/* Tipografía / Letra */}
                    <div className="flex items-center gap-1">
                        <Type className="h-3.5 w-3.5 text-muted-foreground ml-1" />
                        <Select value={selectedFont} onValueChange={applyFont}>
                            <SelectTrigger className="h-8 text-xs w-[145px] bg-background font-medium">
                                <SelectValue placeholder="Fuente" />
                            </SelectTrigger>
                            <SelectContent>
                                {FONTS.map((f) => (
                                    <SelectItem key={f.value} value={f.value} style={{ fontFamily: f.value }}>
                                        {f.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Tamaño de Letra */}
                    <Select value={selectedSize} onValueChange={applySize}>
                        <SelectTrigger className="h-8 text-xs w-[120px] bg-background font-medium">
                            <SelectValue placeholder="Tamaño" />
                        </SelectTrigger>
                        <SelectContent>
                            {FONT_SIZES.map((s) => (
                                <SelectItem key={s.value} value={s.value}>
                                    {s.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    {/* Color de Letra */}
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="sm" className="h-8 px-2 gap-1.5 text-xs bg-background">
                                <Palette className="h-3.5 w-3.5" />
                                <span
                                    className="h-3.5 w-3.5 rounded-full border border-border shadow-2xs"
                                    style={{ backgroundColor: selectedColor }}
                                />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="w-48 p-2">
                            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-2 py-1">
                                Color del texto
                            </div>
                            <div className="grid grid-cols-3 gap-1.5 p-1">
                                {COLORS.map((c) => (
                                    <button
                                        key={c.color}
                                        type="button"
                                        title={c.label}
                                        onClick={() => applyColor(c.color)}
                                        className={cn(
                                            "h-7 w-full rounded-md border flex items-center justify-center transition-transform hover:scale-110",
                                            selectedColor === c.color ? "ring-2 ring-primary ring-offset-1" : "border-border"
                                        )}
                                        style={{ backgroundColor: c.color }}
                                    />
                                ))}
                            </div>
                            <div className="pt-2 mt-2 border-t border-border flex items-center gap-2 px-1">
                                <input
                                    type="color"
                                    value={selectedColor}
                                    onChange={(e) => applyColor(e.target.value)}
                                    className="h-6 w-6 rounded cursor-pointer border-0 p-0"
                                    title="Personalizado"
                                />
                                <span className="text-xs text-muted-foreground">Más colores...</span>
                            </div>
                        </DropdownMenuContent>
                    </DropdownMenu>

                    <div className="h-4 w-px bg-border/60 mx-1 hidden sm:block" />

                    {/* Estilos básicos */}
                    <div className="flex items-center gap-0.5">
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-xs font-bold"
                            onClick={() => exec('bold')}
                            title="Negrita (Ctrl+B)"
                        >
                            <Bold className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-xs italic"
                            onClick={() => exec('italic')}
                            title="Cursiva (Ctrl+I)"
                        >
                            <Italic className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-xs underline"
                            onClick={() => exec('underline')}
                            title="Subrayado (Ctrl+U)"
                        >
                            <Underline className="h-3.5 w-3.5" />
                        </Button>
                    </div>

                    <div className="h-4 w-px bg-border/60 mx-1 hidden sm:block" />

                    {/* Alineación */}
                    <div className="flex items-center gap-0.5">
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => exec('justifyLeft')}
                            title="Alinear a la izquierda"
                        >
                            <AlignLeft className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => exec('justifyCenter')}
                            title="Centrar"
                        >
                            <AlignCenter className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => exec('justifyRight')}
                            title="Alinear a la derecha"
                        >
                            <AlignRight className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => exec('justifyFull')}
                            title="Justificar"
                        >
                            <AlignJustify className="h-3.5 w-3.5" />
                        </Button>
                    </div>

                    <div className="h-4 w-px bg-border/60 mx-1 hidden sm:block" />

                    {/* Listas y Limpiar */}
                    <div className="flex items-center gap-0.5">
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => exec('insertUnorderedList')}
                            title="Lista con viñetas"
                        >
                            <List className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => exec('insertOrderedList')}
                            title="Lista numerada"
                        >
                            <ListOrdered className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            onClick={() => exec('removeFormat')}
                            title="Quitar formato"
                        >
                            <RemoveFormatting className="h-3.5 w-3.5" />
                        </Button>
                    </div>
                </div>
            )}

            {/* Hoja editable */}
            <div
                ref={editorRef}
                contentEditable={!readOnly}
                onInput={handleContentChange}
                onBlur={handleContentChange}
                data-placeholder={placeholder}
                className={cn(
                    "p-6 sm:p-8 min-h-[360px] max-h-[620px] overflow-y-auto leading-relaxed focus:outline-none bg-background text-foreground text-sm font-sans",
                    readOnly && "bg-muted/20 cursor-default",
                    "[&_p]:mb-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:mb-3"
                )}
            />
        </div>
    );
};

export default RichConsentEditor;
