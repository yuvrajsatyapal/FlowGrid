export default {
    darkMode: "class",
    content: ["./index.html", "./src/**/*.{ts,tsx}"],
    theme: {
        extend: {
            colors: {
                // These consume the Hallmark OKLCH CSS custom properties from tokens.css
                paper: "oklch(var(--color-paper) / <alpha-value>)",
                "paper-2": "oklch(var(--color-paper-2) / <alpha-value>)",
                "paper-3": "oklch(var(--color-paper-3) / <alpha-value>)",
                ink: "oklch(var(--color-ink) / <alpha-value>)",
                "ink-2": "oklch(var(--color-ink-2) / <alpha-value>)",
                "ink-3": "oklch(var(--color-ink-3) / <alpha-value>)",
                accent: "oklch(var(--color-accent) / <alpha-value>)",
                "accent-hover": "oklch(var(--color-accent-hover) / <alpha-value>)",
                muted: "oklch(var(--color-muted) / <alpha-value>)",
                border: "oklch(var(--color-border) / <alpha-value>)",
                error: "oklch(var(--color-error) / <alpha-value>)",
                success: "oklch(var(--color-success) / <alpha-value>)",
                warning: "oklch(var(--color-warning) / <alpha-value>)",
            },
            fontFamily: {
                display: ["var(--font-display)", "ui-sans-serif", "system-ui", "sans-serif"],
                body: ["var(--font-body)", "ui-sans-serif", "system-ui", "sans-serif"],
                mono: ["var(--font-mono)", "ui-monospace", "monospace"],
            },
            spacing: {
                xs: "var(--space-xs)",
                sm: "var(--space-sm)",
                md: "var(--space-md)",
                lg: "var(--space-lg)",
                xl: "var(--space-xl)",
                "2xl": "var(--space-2xl)",
                "3xl": "var(--space-3xl)",
            },
            borderRadius: {
                card: "var(--radius-card)",
                button: "var(--radius-button)",
                badge: "var(--radius-badge)",
                input: "var(--radius-input)",
                modal: "var(--radius-modal)",
            },
            transitionTimingFunction: {
                "ease-out": "var(--ease-out)",
                "ease-in": "var(--ease-in)",
                "ease-in-out": "var(--ease-in-out)",
            },
            transitionDuration: {
                fast: "var(--dur-fast)",
                base: "var(--dur-base)",
                slow: "var(--dur-slow)",
            },
        },
    },
    plugins: [],
};
