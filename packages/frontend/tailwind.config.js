/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // NEXORA AI brand palette — sampled from the hero image (dusk/teal/amber)
        primary:        '#1E3A4C',  // deep dusk blue — nav, primary buttons
        'primary-dark': '#0E1E29',  // darkest sky tone — hover/pressed
        secondary:      '#4FB6C4',  // teal grid glow — secondary buttons, links
        accent:         '#F2A65A',  // amber sunset — key CTAs, highlighted stats
        'accent-warm':  '#E2725B',  // deeper sunset orange — hover emphasis
        'bg-dark':      '#12181F',  // night sky — dark surfaces, footer
        'text-on-dark': '#F4F7F9',  // near-white — text over dark/hero
        'text-muted':   '#AEBFC9',  // soft blue-gray sky — secondary muted text
        // Keep legacy names pointing to new values so any remaining usage resolves
        secondary_old:  '#4FB6C4',
        accent_old:     '#F2A65A',
      },
    },
  },
  plugins: [require('@tailwindcss/forms')],
};
