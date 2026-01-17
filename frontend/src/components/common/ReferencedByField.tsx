import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface ReferencedByFieldProps {
  placeholder?: string;
}

export function ReferencedByField({
  placeholder = "Eg: Hon. MLA, Party President, DC Office",
}: ReferencedByFieldProps) {
  return (
    <div className="space-y-1">
      <Label>
        Referenced By <span className="text-red-500">*</span>
        <span className="ml-1 text-xs text-muted-foreground">
          (Mandatory)
        </span>
      </Label>
      <Input placeholder={placeholder} />
      <p className="text-xs text-muted-foreground">
        Name of person or office that recommended this entry
      </p>
    </div>
  );
}
