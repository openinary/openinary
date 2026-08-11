import CodeBlockIllustration from "@/components/ui/illustrations/code-block-illustration"

export default function CodeDemoSection() {
    return (
        <section className="bg-background @container py-24">
            <div className="mx-auto w-full max-w-5xl px-6">
                <div className="@3xl:p-12 relative">
                    <div
                        aria-hidden
                        className="@3xl:block mask-x-from-95% border-foreground/5 pointer-events-none absolute -inset-x-12 inset-y-0 hidden border-y"></div>
                    <div
                        aria-hidden
                        className="@3xl:block mask-y-from-95% border-foreground/5 pointer-events-none absolute -inset-y-12 inset-x-0 hidden border-x"></div>
                    <CodeBlockIllustration />
                </div>
            </div>
        </section>
    )
}