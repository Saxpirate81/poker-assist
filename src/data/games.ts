import type { PokerGame } from '../types/poker'

const slot = (
  id: string,
  label: string,
  group: 'player' | 'dealer' | 'community' | 'shared',
  hidden = false
) => ({ id, label, group, hidden })

export const POKER_GAMES: PokerGame[] = [
  {
    id: 'caribbean-stud',
    name: 'Caribbean Stud',
    emoji: '🏝️',
    description: '5 cards vs the dealer. Ante, then raise 2× ante or fold after seeing your hand.',
    playerSlots: [
      slot('p1', 'Card 1', 'player'),
      slot('p2', 'Card 2', 'player'),
      slot('p3', 'Card 3', 'player'),
      slot('p4', 'Card 4', 'player'),
      slot('p5', 'Card 5', 'player'),
    ],
    dealerSlots: [
      slot('d1', 'Up card', 'dealer', false),
      slot('d2', 'D2', 'dealer', true),
      slot('d3', 'D3', 'dealer', true),
      slot('d4', 'D4', 'dealer', true),
      slot('d5', 'D5', 'dealer', true),
    ],
    bettingRounds: ['ante', 'raise'],
    defaultRules: [
      { id: 'ante', label: 'Ante ($)', type: 'number', value: 5, min: 0.25, max: 500, step: 0.25 },
      { id: 'raiseMultiplier', label: 'Raise multiplier', type: 'select', value: '2', options: [
        { label: '2× ante', value: '2' },
        { label: '3× ante', value: '3' },
      ]},
      { id: 'qualifyAceKing', label: 'Dealer qualifies A-K high', type: 'boolean', value: true },
      { id: 'progressiveJackpot', label: 'Progressive jackpot side bet', type: 'boolean', value: false },
      { id: 'progressiveBet', label: 'Progressive bet ($)', type: 'number', value: 1, min: 1, max: 5, step: 1 },
    ],
    rulesSummary: [
      'Place an ante before any cards are dealt.',
      'You receive 5 face-up cards; dealer gets 5 face-down.',
      'After viewing your hand: raise (2× ante) or fold (lose ante).',
      'Dealer must qualify with Ace-King or better to play.',
      'Higher poker hand wins; payouts follow the pay table.',
    ],
    strategyTips: [
      'Always raise with any pair or better.',
      'Raise Ace-high with Jack kicker or better (AK, AQ, AJ).',
      'Fold Ace-high with Ten kicker or lower.',
      'Raise pays 1:1 — always max raise (2× ante) when raising.',
    ],
  },
  {
    id: 'texas-holdem',
    name: "Texas Hold'em",
    emoji: '🤠',
    description: '2 hole cards + 5 community cards. Best 5-card hand wins.',
    playerSlots: [
      slot('p1', 'Hole 1', 'player'),
      slot('p2', 'Hole 2', 'player'),
    ],
    communitySlots: [
      slot('c1', 'Flop 1', 'community'),
      slot('c2', 'Flop 2', 'community'),
      slot('c3', 'Flop 3', 'community'),
      slot('c4', 'Turn', 'community'),
      slot('c5', 'River', 'community'),
    ],
    bettingRounds: ['preflop', 'flop', 'turn', 'river'],
    defaultRules: [
      { id: 'smallBlind', label: 'Small blind ($)', type: 'number', value: 1, min: 1, max: 100 },
      { id: 'bigBlind', label: 'Big blind ($)', type: 'number', value: 2, min: 2, max: 200 },
      { id: 'minRaise', label: 'Min raise (× BB)', type: 'number', value: 2, min: 2, max: 10 },
      { id: 'noLimit', label: 'No-limit betting', type: 'boolean', value: true },
    ],
    rulesSummary: [
      'Each player gets 2 private hole cards.',
      'Five community cards dealt: flop (3), turn (1), river (1).',
      'Make the best 5-card hand from your 2 + 5 community cards.',
      'Four betting rounds: pre-flop, flop, turn, river.',
    ],
    strategyTips: [
      'Play tight from early position; widen in late position.',
      'Position is power — act last when possible.',
      'Bet for value with strong hands; bluff selectively on scary boards.',
      'Fold marginal hands to large raises.',
    ],
  },
  {
    id: 'three-card-poker',
    name: 'Three Card Poker',
    emoji: '🃏',
    description: '3 cards each. Ante + optional Pair Plus side bet. Play or fold.',
    playerSlots: [
      slot('p1', 'Card 1', 'player'),
      slot('p2', 'Card 2', 'player'),
      slot('p3', 'Card 3', 'player'),
    ],
    dealerSlots: [
      slot('d1', 'D1', 'dealer', true),
      slot('d2', 'D2', 'dealer', true),
      slot('d3', 'D3', 'dealer', true),
    ],
    bettingRounds: ['ante', 'play'],
    defaultRules: [
      { id: 'ante', label: 'Ante ($)', type: 'number', value: 5, min: 1, max: 200 },
      { id: 'pairPlus', label: 'Pair Plus side bet', type: 'boolean', value: false },
      { id: 'playMultiplier', label: 'Play bet (× ante)', type: 'select', value: '1', options: [
        { label: '1× ante', value: '1' },
        { label: '2× ante', value: '2' },
        { label: '3× ante', value: '3' },
        { label: '4× ante', value: '4' },
      ]},
    ],
    rulesSummary: [
      'Ante required; optional Pair Plus side bet.',
      '3 cards dealt to player and dealer.',
      'Play bet (1× ante) to stay in, or fold and lose ante.',
      'Dealer needs Queen-high or better to qualify.',
    ],
    strategyTips: [
      'Play Q-6-4 or better (Queen high, 6 kicker, 4 second kicker).',
      'Always play pairs and better.',
      'Fold hands worse than Q-6-4.',
    ],
  },
  {
    id: 'omaha',
    name: 'Omaha',
    emoji: '🌽',
    description: '4 hole cards, must use exactly 2 + 3 community cards.',
    playerSlots: [
      slot('p1', 'Hole 1', 'player'),
      slot('p2', 'Hole 2', 'player'),
      slot('p3', 'Hole 3', 'player'),
      slot('p4', 'Hole 4', 'player'),
    ],
    communitySlots: [
      slot('c1', 'Flop 1', 'community'),
      slot('c2', 'Flop 2', 'community'),
      slot('c3', 'Flop 3', 'community'),
      slot('c4', 'Turn', 'community'),
      slot('c5', 'River', 'community'),
    ],
    bettingRounds: ['preflop', 'flop', 'turn', 'river'],
    defaultRules: [
      { id: 'smallBlind', label: 'Small blind ($)', type: 'number', value: 1, min: 1, max: 100 },
      { id: 'bigBlind', label: 'Big blind ($)', type: 'number', value: 2, min: 2, max: 200 },
      { id: 'potLimit', label: 'Pot-limit (vs no-limit)', type: 'boolean', value: true },
    ],
    rulesSummary: [
      'Four hole cards dealt to each player.',
      'Must use exactly 2 hole + 3 community cards.',
      'Higher variance than Hold\'em — nut hands matter more.',
    ],
    strategyTips: [
      'Play hands with connected cards and suited combinations.',
      'Avoid playing only one pair on dangerous boards.',
      'Draw to the nuts, not just any flush or straight.',
    ],
  },
  {
    id: 'video-poker',
    name: 'Video Poker',
    emoji: '🎰',
    description: '5 cards, hold/discard, draw replacements. Jacks or Better style.',
    playerSlots: [
      slot('p1', 'Card 1', 'player'),
      slot('p2', 'Card 2', 'player'),
      slot('p3', 'Card 3', 'player'),
      slot('p4', 'Card 4', 'player'),
      slot('p5', 'Card 5', 'player'),
    ],
    bettingRounds: ['ante', 'play'],
    defaultRules: [
      { id: 'bet', label: 'Bet per hand ($)', type: 'number', value: 1, min: 1, max: 25 },
      { id: 'maxCoins', label: 'Max coins (5)', type: 'boolean', value: true },
      { id: 'variant', label: 'Variant', type: 'select', value: 'jacks-or-better', options: [
        { label: 'Jacks or Better', value: 'jacks-or-better' },
        { label: 'Deuces Wild', value: 'deuces-wild' },
      ]},
    ],
    rulesSummary: [
      'Place bet, receive 5 cards.',
      'Choose which cards to hold, discard the rest.',
      'Draw replacements; paid by pay table (pair of Jacks+).',
    ],
    strategyTips: [
      'Always hold made hands (pair+, straight, flush).',
      'Four to a flush beats one high card.',
      'Never break a flush or straight to chase a better hand.',
    ],
  },
]

export function getGameById(id: string): PokerGame | undefined {
  return POKER_GAMES.find(g => g.id === id)
}
