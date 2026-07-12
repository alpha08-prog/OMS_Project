import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface ReferencedByFieldProps {
  /** Controlled value. */
  value: string;
  /** Change handler receiving the new string value. */
  onChange: (value: string) => void;
  placeholder?: string;
  /** Show the required marker + "(Mandatory)" hint. Defaults to true. */
  required?: boolean;
  /** Id used to associate the label with the input (label htmlFor). */
  id?: string;
}

/**
 * Shared "Referenced By" field used across the data-entry forms.
 *
 * Controlled — pass `value` + `onChange`. The label is associated with the
 * input via htmlFor/id so clicking the label focuses the field and screen
 * readers announce it correctly.
 */
export function ReferencedByField({
  value,
  onChange,
  placeholder = "Eg: Hon. MLA, Party President, DC Office",
  required = true,
  id = "referencedBy",
}: ReferencedByFieldProps) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>
        Referenced By {required && <span className="text-red-500">*</span>}
        {required && (
          <span className="ml-1 text-xs text-muted-foreground">(Mandatory)</span>
        )}
      </Label>
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
      <p className="text-xs text-muted-foreground">
        Name of person or office that recommended this entry
      </p>
    </div>
  );
}
