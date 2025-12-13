import { Cake, Send } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Avatar, AvatarFallback } from "../ui/avatar";

const birthdays = [
  { name: "Suresh Patel", designation: "Party Worker", ward: "Ward 5" },
  { name: "Anita Gupta", designation: "Official", ward: "Central" },
  { name: "Vikram Singh", designation: "Public", ward: "West" },
];

export function BirthdayWidget() {
  return (
    <Card className="shadow-sm border-pink-200 bg-gradient-to-br from-pink-50 to-rose-50 dark:from-pink-950/20 dark:to-rose-950/20 dark:border-pink-800">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-pink-500/10">
            <Cake className="h-5 w-5 text-pink-500" />
          </div>
          <CardTitle className="text-lg font-semibold text-pink-900 dark:text-pink-100">
            Today's Birthdays
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {birthdays.map((person, index) => (
          <div
            key={index}
            className="flex items-center gap-3 p-3 rounded-xl bg-white/60 dark:bg-black/20"
          >
            <Avatar className="h-10 w-10 bg-gradient-to-br from-pink-400 to-rose-500">
              <AvatarFallback className="text-white font-semibold text-sm">
                {person.name.split(" ").map(n => n[0]).join("")}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-foreground truncate">{person.name}</p>
              <p className="text-xs text-muted-foreground">
                {person.designation} • {person.ward}
              </p>
            </div>
            <Button size="sm" variant="outline" className="gap-1 text-pink-600 border-pink-300 hover:bg-pink-100">
              <Send className="h-3.5 w-3.5" />
              SMS
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
