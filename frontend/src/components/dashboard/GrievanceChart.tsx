import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";

const data = [
  { name: "Resolved", value: 65, color: "hsl(142, 71%, 45%)" },
  { name: "In Progress", value: 25, color: "hsl(38, 92%, 50%)" },
  { name: "Pending", value: 10, color: "hsl(0, 84%, 60%)" },
];

export function GrievanceChart() {
  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg font-semibold">Grievance Status</CardTitle>
      </CardHeader>
      <CardContent>
        {/* CSS pie chart using conic-gradient to avoid external deps */}
        <div className="h-[220px] flex items-center justify-center">
          {(() => {
            const total = data.reduce((s, d) => s + d.value, 0)
            let acc = 0
            const stops = data
              .map((d) => {
                const start = (acc / total) * 360
                acc += d.value
                const end = (acc / total) * 360
                return `${d.color} ${start}deg ${end}deg`
              })
              .join(", ")
            return (
              <div className="relative">
                <div
                  className="h-40 w-40 rounded-full"
                  style={{ background: `conic-gradient(${stops})` }}
                />
                <div className="absolute inset-4 rounded-full bg-card" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-2xl font-bold">100%</span>
                </div>
              </div>
            )
          })()}
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          {data.map((item) => (
            <div key={item.name} className="p-2 rounded-lg bg-muted/50">
              <p className="text-2xl font-bold" style={{ color: item.color }}>
                {item.value}%
              </p>
              <p className="text-xs text-muted-foreground">{item.name}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
