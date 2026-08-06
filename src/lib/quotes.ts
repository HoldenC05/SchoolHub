export interface Quote {
  text: string;
  ref: string;
}

export const QUOTES: Quote[] = [
  // Scripture (ESV)
  { text: "The steadfast love of the LORD never ceases; his mercies never come to an end; they are new every morning; great is your faithfulness.", ref: "Lamentations 3:22–23 (ESV)" },
  { text: "Commit your work to the LORD, and your plans will be established.", ref: "Proverbs 16:3 (ESV)" },
  { text: "Whatever you do, work heartily, as for the Lord and not for men.", ref: "Colossians 3:23 (ESV)" },
  { text: "I can do all things through him who strengthens me.", ref: "Philippians 4:13 (ESV)" },
  { text: "But seek first the kingdom of God and his righteousness, and all these things will be added to you.", ref: "Matthew 6:33 (ESV)" },
  { text: "For by grace you have been saved through faith. And this is not your own doing; it is the gift of God, not a result of works, so that no one may boast.", ref: "Ephesians 2:8–9 (ESV)" },
  { text: "The LORD is my shepherd; I shall not want.", ref: "Psalm 23:1 (ESV)" },
  { text: "Have I not commanded you? Be strong and courageous. Do not be frightened, and do not be dismayed, for the LORD your God is with you wherever you go.", ref: "Joshua 1:9 (ESV)" },
  { text: "And we know that for those who love God all things work together for good, for those who are called according to his purpose.", ref: "Romans 8:28 (ESV)" },
  { text: "Let no one despise you for your youth, but set the believers an example in speech, in conduct, in love, in faith, in purity.", ref: "1 Timothy 4:12 (ESV)" },
  { text: "For I know the plans I have for you, declares the LORD, plans for welfare and not for evil, to give you a future and a hope.", ref: "Jeremiah 29:11 (ESV)" },
  { text: "Therefore do not be anxious about tomorrow, for tomorrow will be anxious about itself. Sufficient for the day is its own trouble.", ref: "Matthew 6:34 (ESV)" },
  { text: "So, whether you eat or drink, or whatever you do, do all to the glory of God.", ref: "1 Corinthians 10:31 (ESV)" },
  { text: "The fear of the LORD is the beginning of wisdom, and the knowledge of the Holy One is insight.", ref: "Proverbs 9:10 (ESV)" },
  { text: "But they who wait for the LORD shall renew their strength; they shall mount up with wings like eagles; they shall run and not be weary; they shall walk and not faint.", ref: "Isaiah 40:31 (ESV)" },
  { text: "Casting all your anxieties on him, because he cares for you.", ref: "1 Peter 5:7 (ESV)" },
  { text: "Trust in the LORD with all your heart, and do not lean on your own understanding. In all your ways acknowledge him, and he will make straight your paths.", ref: "Proverbs 3:5–6 (ESV)" },
  { text: "And whatever you do, in word or deed, do everything in the name of the Lord Jesus, giving thanks to God the Father through him.", ref: "Colossians 3:17 (ESV)" },
  // Calvin
  { text: "We are not our own; let not our reason nor our will, therefore, sway our plans and deeds. We are not our own: let us not, then, set it as our goal to seek what is expedient for us.", ref: "John Calvin" },
  { text: "There is not one blade of grass, there is no color in this world that is not intended to make us rejoice.", ref: "John Calvin" },
  // Luther
  { text: "Pray, and let God worry.", ref: "Martin Luther" },
  { text: "Faith is a living, daring confidence in God's grace.", ref: "Martin Luther" },
  // Edwards
  { text: "The enjoyment of God is the only happiness with which our souls can be satisfied.", ref: "Jonathan Edwards" },
  { text: "Resolved, that I will live so as I shall wish I had done when I come to die.", ref: "Jonathan Edwards" },
  // Spurgeon
  { text: "The task ahead of you is never greater than the strength behind you.", ref: "C.H. Spurgeon" },
  { text: "It is not how much we have, but how much we enjoy, that makes happiness.", ref: "C.H. Spurgeon" },
  { text: "God is too good to be unkind and too wise to be mistaken.", ref: "C.H. Spurgeon" },
  // Lloyd-Jones
  { text: "The glory of the gospel is that when the church is absolutely different from the world, she invariably attracts it.", ref: "Martyn Lloyd-Jones" },
  // Owen
  { text: "Be killing sin, or it will be killing you.", ref: "John Owen" },
  { text: "The life of faith is a life of active dependence upon God.", ref: "John Owen" },
  // Bunyan
  { text: "In prayer it is better to have a heart without words than words without a heart.", ref: "John Bunyan" },
  { text: "You have never really enjoyed life until you have given it wholly to God.", ref: "John Bunyan" },
  // Warfield
  { text: "There is nothing in us or done by us, at any stage of our earthly development, because of which we are acceptable to God.", ref: "B.B. Warfield" },
  // Machen
  { text: "The gospel is not a thing to be defended, but to be proclaimed.", ref: "J. Gresham Machen" },
  // Piper
  { text: "God is most glorified in us when we are most satisfied in him.", ref: "John Piper" },
  { text: "The chief end of man is to glorify God by enjoying him forever.", ref: "John Piper" },
  // Murray
  { text: "Grace is not only the foundation of our salvation; it is the atmosphere of the whole Christian life.", ref: "John Murray" },
  // Packer
  { text: "Once you become aware that the main business that you are here for is to know God, most of life's problems fall into place of their own accord.", ref: "J.I. Packer" },
  // Stott
  { text: "We must be global Christians with a global vision because our God is a global God.", ref: "John Stott" },
  // Keller
  { text: "The gospel is not just the ABCs of the Christian life, but the A to Z.", ref: "Timothy Keller" },
  { text: "The gospel changes our view of everything, especially our view of ourselves.", ref: "Timothy Keller" },
  // Carson
  { text: "God's sovereignty and human responsibility are both taught in Scripture, and both are true.", ref: "D.A. Carson" },
  { text: "The cross is the measure of our sins, but it is also the measure of God's love.", ref: "D.A. Carson" },
];

export function quoteForDate(d: Date = new Date()): Quote {
  const day = Math.floor(d.getTime() / 86400000);
  return QUOTES[((day % QUOTES.length) + QUOTES.length) % QUOTES.length];
}

export function nextQuote(current: Quote): Quote {
  const idx = QUOTES.findIndex((q) => q === current);
  const start = idx >= 0 ? idx : Math.floor(Math.random() * QUOTES.length);
  return QUOTES[(start + 1) % QUOTES.length];
}
