import { cn } from "@/lib/utils";
import type React from "react";

function Card({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			className={cn(
				"relative w-full max-w-xs rounded-xl border bg-background p-1",
				className
			)}
			{...props}
		/>
	);
}

function Header({
	className,
	children,
	isPopular,
	...props
}: React.ComponentProps<"div"> & {
	isPopular?: boolean;
}) {
	return (
		<div
			className={cn(
				"relative mb-4 rounded-xl border p-4",
				isPopular && "bg-card shadow-xs",
				className
			)}
			{...props}
		>
			{children}
		</div>
	);
}

function Plan({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			className={cn("mb-8 flex items-center justify-between", className)}
			{...props}
		/>
	);
}

function Description({ className, ...props }: React.ComponentProps<"p">) {
	return (
		<p className={cn("text-muted-foreground text-xs", className)} {...props} />
	);
}

function PlanName({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			className={cn(
				"flex items-center gap-2 font-medium text-sm [&_svg:not([class*='size-'])]:size-4",
				className
			)}
			{...props}
		/>
	);
}

function Badge({ className, ...props }: React.ComponentProps<"span">) {
	return (
		<span
			className={cn(
				"rounded-full border bg-background px-3 py-1 text-xs shadow-xs",
				className
			)}
			{...props}
		/>
	);
}

function Price({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div className={cn("mb-3 flex items-end gap-1", className)} {...props} />
	);
}

function MainPrice({ className, ...props }: React.ComponentProps<"span">) {
	return (
		<span
			className={cn("font-semibold text-3xl tracking-tight", className)}
			{...props}
		/>
	);
}

function Period({ className, ...props }: React.ComponentProps<"span">) {
	return (
		<span
			className={cn("pb-1 text-muted-foreground text-sm", className)}
			{...props}
		/>
	);
}

function OriginalPrice({ className, ...props }: React.ComponentProps<"span">) {
	return (
		<span
			className={cn(
				"mr-1 ml-auto text-lg text-muted-foreground line-through",
				className
			)}
			{...props}
		/>
	);
}

function Body({ className, ...props }: React.ComponentProps<"div">) {
	return <div className={cn("space-y-6 p-3", className)} {...props} />;
}

function List({ className, ...props }: React.ComponentProps<"ul">) {
	return <ul className={cn("space-y-3", className)} {...props} />;
}

function ListItem({ className, ...props }: React.ComponentProps<"li">) {
	return (
		<li
			className={cn(
				"flex items-start gap-3 text-muted-foreground text-sm",
				className
			)}
			{...props}
		/>
	);
}

function Separator({
	children = "Upgrade to access",
	className,
	...props
}: React.ComponentProps<"div"> & {
	children?: string;
	className?: string;
}) {
	return (
		<div
			className={cn(
				"flex items-center gap-3 text-muted-foreground text-sm",
				className
			)}
			{...props}
		>
			<span className="h-px flex-1 bg-border" />
			<span className="shrink-0 text-muted-foreground">{children}</span>
			<span className="h-px flex-1 bg-border" />
		</div>
	);
}

export {
	Card,
	Header,
	Description,
	Plan,
	PlanName,
	Badge,
	Price,
	MainPrice,
	Period,
	OriginalPrice,
	Body,
	List,
	ListItem,
	Separator,
};
