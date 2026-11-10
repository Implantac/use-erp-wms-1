import React from 'react';
import { AlertCircle, CheckCircle2, Info, XCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from "@/ui/base/alert";
import { Button } from "@/ui/base/button";
import { cn } from "@/lib/utils";

export type FeedbackType = 'error' | 'success' | 'warning' | 'info';

interface OperationalFeedbackProps {
  type: FeedbackType;
  title: string;
  message: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

const icons = {
  error: <XCircle className="h-4 w-4" />,
  success: <CheckCircle2 className="h-4 w-4" />,
  warning: <AlertCircle className="h-4 w-4" />,
  info: <Info className="h-4 w-4" />,
};

const variants = {
  error: "border-destructive/50 text-destructive dark:border-destructive [&>svg]:text-destructive",
  success: "border-primary/50 text-primary dark:border-primary [&>svg]:text-primary",
  warning: "border-warning/50 text-warning-text dark:border-warning [&>svg]:text-warning-text",
  info: "border-info/50 text-info dark:border-info [&>svg]:text-info",
};

export const OperationalFeedback: React.FC<OperationalFeedbackProps> = ({
  type,
  title,
  message,
  action,
  className,
}) => {
  return (
    <Alert className={cn(variants[type], "bg-background/50 backdrop-blur-sm shadow-sm", className)}>
      {icons[type]}
      <AlertTitle className="font-bold uppercase tracking-tight text-xs mb-1">
        {title}
      </AlertTitle>
      <AlertDescription className="text-sm opacity-90 leading-relaxed">
        {message}
        {action && (
          <div className="mt-3">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={action.onClick}
              className="h-7 text-[10px] font-bold uppercase tracking-wider bg-background hover:bg-muted transition-colors"
            >
              {action.label}
            </Button>
          </div>
        )}
      </AlertDescription>
    </Alert>
  );
};
