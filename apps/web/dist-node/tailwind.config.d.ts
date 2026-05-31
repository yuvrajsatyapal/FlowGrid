declare const _default: {
    darkMode: "class";
    content: string[];
    theme: {
        extend: {
            colors: {
                paper: string;
                "paper-2": string;
                "paper-3": string;
                ink: string;
                "ink-2": string;
                "ink-3": string;
                accent: string;
                "accent-hover": string;
                muted: string;
                border: string;
                error: string;
                success: string;
                warning: string;
            };
            fontFamily: {
                display: [string, string, string, string];
                body: [string, string, string, string];
                mono: [string, string, string];
            };
            spacing: {
                xs: string;
                sm: string;
                md: string;
                lg: string;
                xl: string;
                "2xl": string;
                "3xl": string;
            };
            borderRadius: {
                card: string;
                button: string;
                badge: string;
                input: string;
                modal: string;
            };
            transitionTimingFunction: {
                "ease-out": string;
                "ease-in": string;
                "ease-in-out": string;
            };
            transitionDuration: {
                fast: string;
                base: string;
                slow: string;
            };
        };
    };
    plugins: any[];
};
export default _default;
