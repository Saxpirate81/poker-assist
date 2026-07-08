# Poker Assist

A stupid-simple poker hand logger with AI coaching. Pick a game, tap cards to log them, and get real-time betting advice.

## Features

- **5 poker games**: Caribbean Stud, Texas Hold'em, Three Card Poker, Omaha, Video Poker
- **Visual card logging**: Tap any card slot → scroll to pick rank & suit
- **Photo recognition**: Snap a photo and AI fills in your cards (requires OpenAI API key)
- **AI coach**: Continuous good/bad decision alerts with bet recommendations
- **Editable rules**: Ante sizes, blinds, side bets — tweak before each session
- **Works offline**: Built-in strategy engine runs without an API key

## Quick Start

```bash
npm install
npm run dev
```

Open http://localhost:5173

## Optional: Enable Full AI

1. Tap ⚙️ Settings
2. Add your [OpenAI API key](https://platform.openai.com)
3. Get enhanced coaching + photo card recognition

Without a key, the app uses a solid rule-based strategy engine for all games.

## How to Use

1. **Choose a game** — Caribbean Stud shows 5 player cards, Hold'em shows 2 hole + 5 community, etc.
2. **Review & tweak rules** — Adjust antes, blinds, and house rules
3. **Start a hand** — Tap empty cards to set rank/suit, or use 📸 Take Photo
4. **Follow the coach** — Green = good move, red = fold, gold = recommended bet size
5. **Log actions** — Fold, Check, or Bet/Raise at the bottom

## Tech

- React + TypeScript + Vite
- Tailwind CSS
- OpenAI GPT-4o (vision + coaching, optional)
