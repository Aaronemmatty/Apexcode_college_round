import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-none border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all duration-150 ease-out outline-none select-none cursor-pointer focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-1 focus-visible:ring-offset-background active:scale-[0.98] active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/30 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground font-bold shadow-none hover:bg-white hover:text-black active:bg-white",
        outline:
          "border-border bg-card/60 text-foreground hover:bg-white hover:text-black hover:border-white active:bg-muted",
        secondary:
          "bg-secondary text-secondary-foreground border border-border/70 hover:bg-white hover:text-black active:bg-secondary/90",
        ghost:
          "text-muted-foreground hover:bg-muted hover:text-foreground active:bg-muted/80",
        destructive:
          "bg-destructive/20 text-destructive hover:bg-destructive hover:text-white border border-destructive/40 focus-visible:border-destructive/60",
        link:
          "text-primary underline-offset-4 hover:underline p-0 h-auto",
        shimmer:
          "bg-primary text-black font-bold border border-primary hover:bg-white hover:text-black",
      },
      size: {
        default:
          "h-8 gap-1.5 px-3 has-data-[icon=inline-end]:pr-2.5 has-data-[icon=inline-start]:pl-2.5",
        xs:
          "h-6 gap-1 px-2 text-xs [&_svg:not([class*='size-'])]:size-3",
        sm:
          "h-7 gap-1.5 px-2.5 text-xs [&_svg:not([class*='size-'])]:size-3.5",
        lg:
          "h-9 gap-2 px-4 text-sm font-semibold [&_svg:not([class*='size-'])]:size-4",
        icon:
          "size-8",
        "icon-xs":
          "size-6 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "size-7 [&_svg:not([class*='size-'])]:size-3.5",
        "icon-lg":
          "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }

