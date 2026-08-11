import { cn } from '@/lib/utils'
import { TooltipProvider, Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Stripe } from '@/components/ui/svgs/stripe'
import { Bolt } from '@/components/ui/svgs/bolt'

const plans = ['stripe', 'bolt'] as const

type Plan = (typeof plans)[number]

type Feature = {
    name: string
    description?: string
    plans: Record<Plan, boolean>
}

const features: Feature[] = [
    {
        name: 'Daily Exercises',
        description: 'Engage users with daily interactive exercises.',
        plans: {
            stripe: true,
            bolt: true,
        },
    },
    {
        name: 'Unlimited Storage',
        description: 'Store unlimited data with no additional cost.',
        plans: {
            stripe: true,
            bolt: true,
        },
    },
    {
        name: 'Custom Dashboards',
        description: 'Create personalized dashboards for data visualization.',
        plans: {
            stripe: true,
            bolt: false,
        },
    },
    {
        name: 'Self-paced Learning',
        description: 'Empower users to learn at their own pace.',
        plans: {
            stripe: true,
            bolt: true,
        },
    },
    {
        name: 'Ad-free Experience',
        description: 'Provide an uninterrupted, ad-free environment.',
        plans: {
            stripe: true,
            bolt: false,
        },
    },
    {
        name: 'Team Collaboration',
        description: 'Enhance productivity with bolt collaboration tools.',
        plans: {
            stripe: true,
            bolt: false,
        },
    },
    {
        name: 'Self-paced Learning',
        description: 'Empower users to learn at their own pace.',
        plans: {
            stripe: true,
            bolt: true,
        },
    },
    {
        name: 'Ad-free Experience',
        description: 'Provide an uninterrupted, ad-free environment.',
        plans: {
            stripe: true,
            bolt: false,
        },
    },
]

const renderPlanColumn = (plan: Plan) => {
    const header =
        plan === 'stripe' ? (
            <div className="sticky top-0 flex h-14 flex-col items-center justify-center gap-1.5 rounded-t-xl px-4 text-center lg:px-6">
                <Stripe className="h-5 w-20" />
            </div>
        ) : (
            <div className="sticky top-0 flex h-14 flex-col items-center justify-center gap-1.5 px-4 pt-2 text-center lg:px-8">
                <Bolt className="h-5 w-20" />
            </div>
        )

    return (
        <div
            data-plan={plan}
            className={cn(plan === 'stripe' && 'ring-border bg-card/50 shadow-black/6.5 relative z-10 rounded-xl shadow-xl ring-1')}>
            {header}

            <div>
                {features.map((feature, index) => (
                    <div
                        key={index}
                        className="odd:bg-card flex h-14 items-center justify-center px-6 text-sm last:h-[calc(3.5rem+1px)] last:border-b group-last:odd:rounded-r-lg">
                        <div>{feature.plans[plan] === true ? <Indicator checked /> : feature.plans[plan] === false ? <Indicator /> : feature.plans[plan]}</div>
                    </div>
                ))}
                <div className="h-6"></div>
            </div>
        </div>
    )
}

export default function FAQs() {
    return (
        <section className="bg-background py-16 md:py-24">
            <div className="mx-auto max-w-5xl md:px-6">
                <div className="grid gap-12 lg:grid-cols-2">
                    <div className="max-w-lg max-md:px-6">
                        <div className="text-balance lg:max-w-xs">
                            <h2 className="text-foreground text-3xl font-semibold md:text-4xl lg:text-5xl">Quick comparison guide</h2>
                            <p className="text-muted-foreground mt-4 text-balance lg:mt-6">Tailark offers a robust and user-friendly link management solution, emerging as the top choice over Cloudflare.</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-2">
                        <div>
                            <div className="z-1 sticky top-0 flex h-14 items-end gap-1.5 px-6 py-2">
                                <div className="text-muted-foreground text-sm font-medium">Features</div>
                            </div>

                            {features.map((feature, index) => (
                                <div
                                    key={index}
                                    className="text-muted-foreground md:nth-2:rounded-tl-xl even:bg-card flex h-14 items-center rounded-l-lg px-6 last:h-[calc(3.5rem+1px)] md:last:rounded-bl-xl">
                                    <div className="text-sm">{feature.name}</div>{' '}
                                    {feature.description && (
                                        <TooltipProvider>
                                            <Tooltip>
                                                <TooltipTrigger className="flex size-7">
                                                    <span className="bg-foreground/10 text-foreground/65 m-auto flex size-4 items-center justify-center rounded-full text-sm">?</span>
                                                </TooltipTrigger>
                                                <TooltipContent className="max-w-56 text-sm">{feature.description}</TooltipContent>
                                            </Tooltip>
                                        </TooltipProvider>
                                    )}
                                </div>
                            ))}
                        </div>

                        <div className="grid grid-cols-2">
                            {plans.map((plan) => (
                                <div
                                    key={plan}
                                    className="group">
                                    {renderPlanColumn(plan)}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </section>
    )
}

const Indicator = ({ checked = false }: { checked?: boolean }) => {
    return <span className={cn('flex size-4 items-center justify-center rounded-full bg-rose-500 font-sans text-xs font-semibold text-white', checked && 'bg-emerald-600 text-white')}>{checked ? <CheckIcon /> : '✗'}</span>
}

const CheckIcon = () => {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 512 512"
            className="size-2.5">
            <path
                fill="currentColor"
                d="M17.47 250.9C88.82 328.1 158 397.6 224.5 485.5c72.3-143.8 146.3-288.1 268.4-444.37L460 26.06C356.9 135.4 276.8 238.9 207.2 361.9c-48.4-43.6-126.62-105.3-174.38-137z"
            />
        </svg>
    )
}