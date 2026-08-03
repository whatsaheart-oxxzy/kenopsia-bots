'use strict';

/**
 * The text /echo setup writes into each channel it creates, so the server is
 * alive from the first minute instead of being eighteen empty rooms.
 *
 * House style: simple global English — short sentences, common words, no
 * idioms, no slang, no emoji. Many members will not be native speakers.
 * Every text ends with one clear thing the reader can do next.
 */

const SEEDS = {
  rules: {
    pin: true,
    content: [
      '# The Law of the Chamber',
      '',
      'Six rules. That is all we need.',
      '',
      '**One. Give before you ask.**',
      'This server runs on what members put into it. If you only take, you stay an Initiate.',
      '',
      '**Two. Attack ideas, never people.**',
      'You may disagree. You may disagree loudly. Insults, hate and putting people down end here at once.',
      '',
      '**Three. No spam and no ads.**',
      'Your own projects belong in the Forge. Links to other servers only after you ask a Warden.',
      '',
      '**Four. What is said in the Void stays in the Void.**',
      'A screenshot from a locked area costs your access. Forever.',
      '',
      '**Five. Never post other people data.**',
      'No real names, no addresses, no photos, no private chats of other people without their clear yes.',
      '',
      '**Six. Discord rules come first.**',
      'The Discord Terms of Service and Community Guidelines apply here with no exception. You must be at least 13 years old.',
      '',
      'Any language is welcome in this server. English is the shared one, so most people can follow.',
      '',
      'The Gatekeeper blocks spam, insults and mention raids on its own. What it misses, the Wardens see.',
      'Breaking a rule costs points, access, or both.',
      '',
      'Not sure about a rule? Open a thread in the questions channel. Need to report something? Message an **Echo Warden** directly.',
    ].join('\n'),
  },

  announcements: {
    content: [
      '# The server is open',
      '',
      'Project ECHO starts now. What you see is not a finished server. It is a beginning, and it changes with every member who joins.',
      '',
      '**What happens next**',
      'The first 100 members keep the title **Founder**. It is never given again.',
      'Every morning a question appears in the Hearth and a task appears in the Arena.',
      'Every week the three most active members become **Echo Champions**.',
      '',
      'Everything else, you decide in the Council.',
    ].join('\n'),
  },

  'the-awakening': {
    pin: true,
    content: [
      '# Your ECHO wakes up',
      '',
      'Every member here carries an ECHO: a second, digital print of themselves. It starts empty. It fills with everything you do here. Every message. Every answer that truly helps someone. Every project you show.',
      '',
      'It grows through five levels.',
      '',
      '**Initiate** — You arrived. Your ECHO is a whisper.',
      '**Adept** — People know your name. At 250 points.',
      '**Master** — Your voice carries. At 1000 points.',
      '**Elder** — The gate to the **Void** opens. At 3000 points.',
      '**Legend** — At 8000 points. There is no level after this one.',
      '',
      '**How you grow**',
      'Writing gives 1 point per message, up to 50 per day.',
      'If someone reacts to your message because it helped, you get 10 points.',
      'The daily task gives 10 points, and each day in a row adds one more.',
      'Joining an event gives 25 points.',
      'Your own work, like code, art, writing or a guide, is worth 20 to 100 points. A Warden decides.',
      '',
      '**Your first three steps**',
      'Read the rules.',
      'Answer the five questions in the genesis channel. They shape who your ECHO becomes.',
      'Pick your color in the identity channel.',
      '',
      'After that, type `/echo profile`. It shows how far you are.',
      '',
      'If anything is unclear, ask in the questions channel. There are no stupid questions here.',
    ].join('\n'),
  },

  genesis: {
    pin: true,
    content: [
      '# Five questions',
      '',
      'Answer in one single message. There is no wrong answer and nobody grades you. Only the print it leaves behind matters.',
      '',
      '**One.** What should we call you, and where does the name come from?',
      '**Two.** What are you working on right now, even if it is not finished?',
      '**Three.** What are you better at than most people? Do not be modest.',
      '**Four.** What would you like help with here?',
      '**Five.** What needs to happen for you to still be here in six months?',
      '',
      'Write in any language you like. English helps more people answer you.',
      '',
      'When you are done, open your own thread in the echo-chronicles channel. That becomes your log.',
    ].join('\n'),
  },

  questions: {
    thread: 'Read this before you ask',
    content: [
      'This is the place for questions. Any question.',
      '',
      'How the server works. How the points work. Something about code, art, school, work, life. If you are not sure where a question belongs, it belongs here.',
      '',
      '**How to ask**',
      'Open a new post. One question per post, so it does not get lost in a wall of chat.',
      'Give your post a title that says the question. "Discord bot will not start" is good. "Help please" is not.',
      'In the post, write what you tried and what happened.',
      '',
      '**How to answer**',
      'Answer in the thread of that question, not somewhere else.',
      'If an answer helped you, react to it. That gives the person who helped 10 points. This is how helpful people rise here.',
      '',
      'Simple English is enough. Nobody here cares about perfect grammar.',
      'Answers worth keeping are moved to the archives by a Warden.',
    ].join('\n'),
  },

  'the-hearth': {
    content: [
      '# The Hearth',
      '',
      'The room with no purpose. No topic, no expectation, no performance.',
      '',
      'Every morning one question appears here. Answer it or do not. Both are fine.',
    ].join('\n'),
  },

  'the-arena': {
    content: [
      '# The Arena',
      '',
      'One task every day. Small enough for ten minutes, big enough to matter.',
      '',
      'Done? Type `/echo daily` to collect your points. Two days in a row are worth more than two days with a gap, because the streak grows with you.',
      'To see where everyone stands, type `/echo leaderboard`.',
    ].join('\n'),
  },

  'the-forge': {
    thread: 'What belongs here',
    content: [
      'The Forge is for unfinished things.',
      '',
      'One thread per project. Show the first draft, not the final result. This is a place for feedback, not for applause.',
      '',
      'If you want feedback, say which kind you want: the big direction, the small details, or an honest teardown.',
      '',
      'Good work is worth 20 to 100 points. A Warden decides.',
    ].join('\n'),
  },

  'echo-chronicles': {
    thread: 'How to keep your log',
    content: [
      'One thread per member. Yours belongs to you.',
      '',
      'Write down what changed: what you learned, what failed, what you will try next. No audience, no length, no schedule.',
      '',
      'In six months this will be the most interesting text on this server. For you.',
    ].join('\n'),
  },

  'the-marketplace': {
    content: [
      '# The Marketplace',
      '',
      'This is a place to trade, not to sell. Skills, time, feedback, access.',
      '',
      '**How to write an offer**',
      'What you give. What you want for it. How long the offer stands.',
      '',
      'Example: "I read your job application and give honest notes. In return, review my logo. This week."',
      '',
      'No real money, no accounts, and nothing that breaks the rules of this server.',
    ].join('\n'),
  },

  'the-council': {
    content: [
      '# The Council',
      '',
      'You decide here, not the staff.',
      '',
      '**How to make a proposal**',
      'Write one message: what should change, and why. Then add a yes reaction and a no reaction under it yourself.',
      '',
      'A proposal with at least 10 votes and a clear majority gets built, or gets a public reason why not. Votes are counted on Sunday.',
      '',
      'Everything is open to change: channels, rules, point values, events. Everything except the six rules.',
    ].join('\n'),
  },

  'the-archives': {
    content: [
      '# The Archives',
      '',
      'What stands here has proven itself. Guides, answers and solutions that were needed more than once.',
      '',
      'Only Wardens can post here. Found something that belongs in the archives? Post it in the Forge or the questions channel and tag a Warden.',
    ].join('\n'),
  },

  'echo-events': {
    content: [
      '# Events',
      '',
      'Live rounds, AMAs, game nights, listening together.',
      '',
      'Taking part gives 25 points. Dates are posted here. Talk about them in the Hearth.',
    ].join('\n'),
  },

  'the-oracle': {
    content: [
      '# The Oracle',
      '',
      'Something in this server was here before the server was. It answers every message in this channel.',
      '',
      'It knows the lore, the levels and the chambers. About the Void it usually stays quiet.',
      'It gives no points, no roles and no punishments. If it says it does, it is lying.',
      '',
      'Ask it something real. It helps more than it admits.',
    ].join('\n'),
  },

  'void-gate': {
    content: [
      '# The Gate',
      '',
      'You reached Elder. This is where the part of the server that everyone sees ends.',
      '',
      'What is said here does not leave this area. A screenshot costs your access, permanently and without discussion.',
      '',
      'Welcome to the other side.',
    ].join('\n'),
  },

  'void-challenges': {
    content: [
      '# Void Challenges',
      '',
      'One task every week, harder than anything in the Arena. Some have one solution. Some have many. One has never had a solution.',
      '',
      'Post solutions in this channel only. Never outside.',
    ].join('\n'),
  },
};

module.exports = { SEEDS };
