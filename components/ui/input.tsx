import { Input as InputPrimitive } from '@base-ui/react/input'

import { cn } from '@/lib/utils'

function Input({ className, ...props }: InputPrimitive.Props) {
  return (
    <InputPrimitive
      data-slot="input"
      className={cn(
        'flex h-9 w-full min-w-0 rounded-lg border border-border bg-background px-3 py-1 text-sm shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20',
        className,
      )}
      {...props}
    />
  )
}

export { Input }
