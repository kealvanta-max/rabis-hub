import type { Config } from "tailwindcss";
const {
    default: flattenColorPalette,
} = require("tailwindcss/lib/util/flattenColorPalette");

const config: Config = {
    content: [
        "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
        "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
        "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
        "./src/lib/**/*.{js,ts,jsx,tsx,mdx}",
    ],
    darkMode: "class",
    theme: {
        extend: {
            colors: {
                primary: {
                    DEFAULT: "#D4AF37",
                    dark: "#B5952F",
                    hover: "#C4A030",
                },
                secondary: "#E5B946",
                navy: {
                    dark: "#0A1628",
                    light: "#152338",
                },
                background: {
                    light: "#F7F5F0",
                    dark: "#0A1628",
                },
                surface: {
                    light: "#FFFFFF",
                    dark: "#1E1E1E",
                    DEFAULT: "#FFFFFF",
                },
                input: {
                    dark: "#1F2937",
                },
                border: {
                    dark: "#374151",
                },
                card: {
                    dark: "#112240",
                    light: "#FFFFFF",
                    bg: "rgba(255,255,255,0.04)",
                },
                admin: {
                    bg: "#0A1628",
                    card: "#12233b",
                    border: "#1e3a5f",
                },
                gold: {
                    DEFAULT: "#D4AF37",
                    accent: "#E5B946",
                    light: "#F2D075",
                },
                accent: {
                    gold: "#ecc813",
                    "gold-light": "#FFF9E6",
                    green: "#10B981",
                    dark: "#1E293B",
                },
                rabi: {
                    green: "#0d7d4a",
                    "green-dark": "#095a35",
                },
                text: {
                    light: "#1E293B",
                    dark: "#E2E8F0",
                    main: "#0e1b15",
                    muted: "#9CA3AF",
                },
                success: "#10B981",
                warning: "#F59E0B",
                danger: "#EF4444",
            },
            fontFamily: {
                display: ["var(--font-dm-serif)", "serif"],
                sans: ["var(--font-inter)", "sans-serif"],
                serif: ["var(--font-dm-serif)", "serif"],
                grotesk: ["var(--font-space-grotesk)", "sans-serif"],
            },
            boxShadow: {
                soft: "0 10px 40px -10px rgba(0,0,0,0.05)",
                card: "0 4px 6px -1px rgba(0,0,0,0.05), 0 2px 4px -1px rgba(0,0,0,0.03)",
            },
        },
    },
    plugins: [
        addVariablesForColors,
        function ({ matchUtilities, theme }: any) {
            matchUtilities(
                {
                    "bg-grid": (value: any) => ({
                        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32' width='32' height='32' fill='none' stroke='${encodeURIComponent(
                            value
                        )}'%3E%3Cpath d='M0 .5H31.5V32'/%3E%3C/svg%3E")`,
                    }),
                    "bg-grid-small": (value: any) => ({
                        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32' width='8' height='8' fill='none' stroke='${encodeURIComponent(
                            value
                        )}'%3E%3Cpath d='M0 .5H31.5V32'/%3E%3C/svg%3E")`,
                    }),
                    "bg-dot": (value: any) => ({
                        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32' width='16' height='16' fill='none'%3E%3Ccircle fill='${encodeURIComponent(
                            value
                        )}' id='pattern-circle' cx='10' cy='10' r='1.625'%3E%3C/circle%3E%3C/svg%3E")`,
                    }),
                },
                { values: flattenColorPalette(theme("backgroundColor")), type: "color" }
            );
        },
    ],
};

function addVariablesForColors({ addBase, theme }: any) {
    let allColors = flattenColorPalette(theme("colors"));
    let newVars = Object.fromEntries(
        Object.entries(allColors).map(([key, val]) => [`--${key}`, val])
    );

    addBase({
        ":root": newVars,
    });
}

export default config;

