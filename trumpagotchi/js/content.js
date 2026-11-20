/* Trumpagotchi — content: every word he says, everything he owns, everything he signs.
   Parody. All "quotes" are invented for a cartoon pet. */
(function (root) {
  'use strict';
  const TG = (root.TG = root.TG || {});
  const C = (TG.content = {});

  // ---------------------------------------------------------------- stages
  // He starts out polite and reasonable. Care makes him... more.
  C.MAX_LEVEL = 50;
  C.STAGES = [
    { id: 'egg', min: 0, name: 'The Golden Egg', blurb: 'A small loan, in egg form.' },
    { id: 'regular', min: 1, name: 'Regular Don', blurb: 'Polite. Modest. Suspiciously reasonable.' },
    { id: 'kid', min: 5, name: 'The Kid from Queens', blurb: 'Has started to notice his own potential.' },
    { id: 'dev', min: 10, name: 'The Developer', blurb: 'Puts his name on things. All things.' },
    { id: 'mogul', min: 17, name: 'The Mogul', blurb: 'Everything he touches turns gold-plated.' },
    { id: 'tv', min: 24, name: 'The TV Boss', blurb: 'Fires imaginary people for sport.' },
    { id: 'cand', min: 32, name: 'The Candidate', blurb: 'Came down an escalator. Never went back up.' },
    { id: 'nominee', min: 39, name: 'The Nominee', blurb: 'They said he couldn’t. They say a lot of things.' },
    { id: 'p45', min: 45, name: 'The 45th', blurb: 'Mr. President. He always knew.' },
    { id: 'p47', min: 47, name: 'The 47th', blurb: 'The comeback. He will mention it.' },
    { id: 'gold', min: 50, name: 'Tremendous Form', blurb: 'Peak. The mountain is being measured.' },
  ];
  C.TIER_NAMES = ['Humble', 'Confident', 'Boastful', 'Tremendous', 'MAXIMUM'];
  C.tierForLevel = function (lv) {
    return lv >= 45 ? 4 : lv >= 32 ? 3 : lv >= 17 ? 2 : lv >= 5 ? 1 : 0;
  };

  C.EVOLVE_LINES = {
    regular: 'Oh! Hello. Thank you for hatching me. I hope I wasn’t any trouble.',
    kid: 'I’m from Queens. I’ve got plans. Big ones.',
    dev: 'I’m putting my name on this building. And that one. And that one.',
    mogul: 'Everything I touch turns to gold. Gold-plated. Same thing.',
    tv: 'You’re fired! ...I just like saying it. Great catchphrase.',
    cand: 'I came down the escalator. Everybody remembers the escalator.',
    nominee: 'They said I couldn’t win. They say a lot of things. Sad!',
    p45: 'Mr. President. Has a nice ring to it. I always knew.',
    p47: 'I’m BACK. The greatest comeback of all time. Everybody says so!',
    gold: 'They want me on the MOUNTAIN. I didn’t ask. But I’d say YES!',
  };

  // ---------------------------------------------------------------- his voice
  // Five registers per situation: humble, confident, boastful, tremendous, MAXIMUM.
  const L = function (t0, t1, t2, t3, t4) { return [t0, t1, t2, t3, t4]; };
  C.LINES = {
    greet: L(
      ['Oh, hello. Nice to see you again.', 'Hi. I hope I’m not bothering you.'],
      ['You’re back. Good. I had some ideas.', 'There you are. Let’s get to work.'],
      ['You’re back! Smart. Very smart of you.', 'Welcome back. I’ve been doing great, by the way. Really great.'],
      ['Look who’s back! Everyone comes back. Everyone.', 'You missed me. I can tell. People always miss me.'],
      ['THE GREATEST CARETAKER RETURNS! Well, second greatest. After me.', 'WELCOME BACK! It was TREMENDOUS without you. Even better with you. Maybe.']
    ),
    greetLong: L(
      ['You were gone a while. That’s okay. I understand.'],
      ['Where were you? I waited. Patiently, I’d say.'],
      ['You were gone forever. Not nice. Not nice at all.'],
      ['Where WERE you? Very disloyal. I’m watching you.'],
      ['{hours} HOURS! Very unfair treatment. Worst absence in HISTORY. Now feed me!']
    ),
    greetMorning: L(
      ['Good morning. I slept fine, thank you for asking.'],
      ['Morning. Big day. I can feel it.'],
      ['Good morning! I slept great. The best sleep.'],
      ['I barely slept. Didn’t need to. Tremendous stamina.'],
      ['GOOD MORNING to everyone, even the HATERS and LOSERS!']
    ),
    idleHappy: L(
      ['This is nice. Thank you for looking after me.', 'I’m content. Is that okay to say?', 'I think I’m doing an adequate job.', 'I hope I’m not taking up too much room.'],
      ['I’m doing well. Really well, actually.', 'I’ve got good instincts. Always have.', 'I could run this place. Just saying.', 'People like me. I’ve noticed that.'],
      ['Everything’s going great. Everyone says so.', 'I have the best office. Look at it. Beautiful.', 'Nobody does it better than me. Nobody.', 'I have the best words. I really do.'],
      ['We’re winning so much. Aren’t you tired of winning?', 'Many people are saying this is the best-run office ever.', 'I know more about offices than anybody. Believe me.', 'A very stable genius lives here. Me. It’s me.'],
      ['We are WINNING like NEVER BEFORE! Thank you for your attention to this matter!', 'TREMENDOUS things are happening. The likes of which NOBODY has ever seen!', 'They said it couldn’t be done. I did it. In RECORD time!', 'Strong men come up to me, tears in their eyes. “Sir,” they say. EVERY time!']
    ),
    hungry: L(
      ['Sorry to bother you, but I’m a little hungry.', 'Could I maybe have something to eat? If it’s no trouble.'],
      ['I could eat. I could definitely eat.'],
      ['I’m hungry. Where’s my burger? I was promised burgers.'],
      ['No food! Can you believe it? A disgrace. Get me a hamberder.'],
      ['I am STARVING! The WORST food shortage in the history of this office!', 'HAMBERDERS. NOW. Thank you!']
    ),
    bored: L(
      ['I wouldn’t mind doing something. Whenever you have time.'],
      ['It’s quiet. Too quiet. Let’s do a deal or something.'],
      ['I’m bored. Let’s golf. I’m a great golfer, you know.'],
      ['Boring! This is low energy. Get me to a golf course.'],
      ['So BORING! Schedule a RALLY. Or golf. Or a rally AT golf!']
    ),
    needEgo: L(
      ['Do you think I’m doing okay? Be honest.'],
      ['Say something nice. I’ve earned it.'],
      ['Nobody’s told me I’m great in almost an hour. Weird.'],
      ['Where’s the applause? There’s usually applause.'],
      ['My ratings are DOWN! Rigged! Somebody tell me I’m the best. QUICKLY!']
    ),
    needGlow: L(
      ['My hair’s a bit of a mess. Sorry about that.'],
      ['I need a comb. A man needs a comb.'],
      ['The hair isn’t right. It has to be right.'],
      ['I’m looking pale. PALE! Get the bronzer.'],
      ['The hair is DEFLATING! This is a NATIONAL EMERGENCY!']
    ),
    tired: L(
      ['I’m getting sleepy. Is it bedtime?'],
      ['Long day. I could use some rest.'],
      ['I’m not tired. I’m never tired. ...Maybe a little.'],
      ['Low energy is for other people. But dim the lights anyway.'],
      ['I have the BEST stamina. Tremendous. Now turn off the lights. Quietly!']
    ),
    ate: L(
      ['Thank you. That {food} was very nice.', 'Mm. I appreciate the {food}.'],
      ['Good {food}. Really good.', 'That hit the spot. Good {food}.'],
      ['Great {food}. One of the best I’ve had. And I’ve had a lot.'],
      ['Tremendous {food}. Nobody eats {food} like me. Nobody.'],
      ['The GREATEST {food} in the HISTORY of {food}! People are saying it!']
    ),
    ateCoke: L(
      ['A soda? How thoughtful.'],
      ['Diet Coke. Good choice.'],
      ['Diet Coke. I should get a button for this. A big one.'],
      ['That’s number {n} today. I’m very disciplined.'],
      ['DIET COKE NUMBER {n}! A PERFECT beverage!']
    ),
    ateSalad: L(
      ['Oh, a salad. That’s healthy. Thank you!'],
      ['Salad. Hm. Okay. I’ll eat around it.'],
      ['A salad? What is this, a punishment?'],
      ['Lettuce! Very unfair. I’m putting a tariff on this. {tariff}%.'],
      ['RADICAL LEFT LETTUCE! {tariff}% TARIFF, effective IMMEDIATELY!']
    ),
    full: L(
      ['No thank you, I couldn’t possibly eat more.'],
      ['I’m full. Maybe later.'],
      ['I’m full. First time that’s ever happened.'],
      ['Even I have limits. Very few. This is one.'],
      ['FULL! The most full anyone has EVER been!']
    ),
    praised: L(
      ['Oh! That’s very kind. I don’t know what to say.', 'You really think so? Thank you.'],
      ['I appreciate that. It’s true, too.'],
      ['True. Very true. You have great judgment.'],
      ['So true. Everybody says it. You said it best, though.'],
      ['CORRECT! Finally, somebody HONEST! You’re hired!']
    ),
    insulted: L(
      ['You’re right. I’ll try to do better.'],
      ['Hm. I don’t love that.'],
      ['Wrong. And frankly, rude.'],
      ['Nasty! A very nasty thing to say.'],
      ['YOU’RE FIRED! ...Fine, you’re rehired. But WATCH IT!']
    ),
    notNeeded: L(
      ['I’m okay for now, thank you.'],
      ['I’m good. Maybe later.'],
      ['I’m already perfect at the moment.'],
      ['You can’t improve on this. Try again later.'],
      ['ALREADY PERFECT! There is nothing to improve!']
    ),
    petted: L(
      ['Hee. That tickles.', 'Oh! Hello.'],
      ['Easy. This suit is new.'],
      ['Careful. This is a very expensive suit.'],
      ['Everyone wants to touch greatness. I get it.'],
      ['YES, I’m REAL! And SPECTACULAR!']
    ),
    hair: L(
      ['It’s just regular hair. Go ahead.'],
      ['Watch the hair, please.'],
      ['Not the hair! It took an hour.'],
      ['DON’T touch the hair. It’s real. It’s mine.'],
      ['HANDS OFF THE HAIR! It’s a NATIONAL TREASURE!']
    ),
    groomSpray: L(
      ['Is that a lot of hairspray? It feels like a lot.'],
      ['A little more on top. Good.'],
      ['More. MORE. It has to hold in the wind.'],
      ['Hairspray was stronger in the old days. This is okay.'],
      ['THE HAIR IS PERFECT! Engineers STUDY this hair!']
    ),
    groomTan: L(
      ['Am I... orange? Is that normal?'],
      ['A healthy glow. I like it.'],
      ['Good color. Very good color. Like a champion.'],
      ['It’s the lighting. I always look this good.'],
      ['A PERFECT GLOW! Totally NATURAL!']
    ),
    groomComb: L(
      ['Thank you. I never know what to do with it.'],
      ['Sweep it forward. No, back. Both.'],
      ['It’s a complicated structure. Very advanced.'],
      ['Nobody understands this hair. I do. Only me.'],
      ['FORWARD, then BACK, then UP! Like a beautiful golden WAVE!']
    ),
    sleep: L(
      ['Goodnight. Thank you for today.'],
      ['Okay. Lights out. Big day tomorrow.'],
      ['I sleep great. Maybe four hours. That’s all I need.'],
      ['Wake me if there’s news. About me.'],
      ['GOODNIGHT to all, even the haters! ...Leave the phone on the pillow.']
    ),
    wake: L(
      ['Good morning. I hope you slept well too.'],
      ['I’m up. Let’s go.'],
      ['I’m up! Refreshed! What did they say about me?'],
      ['I’m awake. I was barely asleep. Always alert.'],
      ['I’M BACK! Did the ratings go up while I slept? Of course they did!']
    ),
    notTired: L(
      ['I’m not really sleepy yet.'],
      ['Not tired. Let’s keep going.'],
      ['I’m not tired. I’m never tired.'],
      ['Sleep is for the low-energy people.'],
      ['NOT TIRED! I have TREMENDOUS stamina!']
    ),
    lowEnergy: L(
      ['I’m too tired for that. Sorry.'],
      ['I need to rest first.'],
      ['I’d win, obviously. But later.'],
      ['Not now. Even champions recharge. Briefly.'],
      ['LATER! Get me a DIET COKE first!']
    ),
    golfWin: L(
      ['It went in! Was that luck? Probably luck.'],
      ['Good round. I’ve got a natural swing.'],
      ['Great round. I win a lot of club championships.'],
      ['Another championship. They keep giving them to me.'],
      ['CLUB CHAMPION AGAIN! Eighteen holes-in-one. Witnesses? MANY!']
    ),
    golfLose: L(
      ['I missed them all. I should practice.'],
      ['Tough greens today.'],
      ['The greens were terrible. Not my fault.'],
      ['I’m counting that as a win. It was a gimme.'],
      ['I WON! The scorecard is RIGGED! Total witch hunt on the back nine!']
    ),
    dealRaise: L(
      ['Should we ask for more? It seems greedy.'],
      ['Let’s see if there’s a little more.'],
      ['We can do better. We always do better.'],
      ['Weak offer. Very weak. Ask again.'],
      ['TERRIBLE offer! Insulting! DOUBLE IT!']
    ),
    dealWin: L(
      ['A deal! I hope they’re happy too.'],
      ['Good deal. Fair deal.'],
      ['Great deal. I make the best deals.'],
      ['They never saw it coming. That’s the art of it.'],
      ['The BIGGEST deal EVER! They’re calling it a MIRACLE!']
    ),
    dealLose: L(
      ['They left. I pushed too hard. My fault.'],
      ['They walked. It happens.'],
      ['They’ll be back. They always come back.'],
      ['Bad buyer. Sad! We didn’t need them.'],
      ['I walked away FIRST! Everyone saw it! We’ll see what happens!']
    ),
    rally: L(
      ['So many people! Are they here for me?'],
      ['Good crowd. Nice people.'],
      ['Big crowd. Really big. Biggest in the area.'],
      ['They said {real}. It was {claimed}. I counted.'],
      ['{claimed} PEOPLE! The largest crowd in HISTORY! PERIOD!']
    ),
    posted: L(
      ['Was that okay to post? I hope nobody minds.'],
      ['Posted. Good post.'],
      ['That one’s going viral. I can feel it.'],
      ['Perfect post. Not a word wasted.'],
      ['POSTED! A masterpiece! They’ll study it in SCHOOLS!']
    ),
    levelUp: L(
      ['I think I’m getting better at this.'],
      ['I’m getting stronger. I can feel it.'],
      ['I’m improving. Hard to believe, but I am.'],
      ['More tremendous by the hour. They’ve noticed.'],
      ['EVEN MORE TREMENDOUS! Scientists said it was IMPOSSIBLE!']
    ),
    bought: L(
      ['For me? It’s too much. Thank you.'],
      ['Nice. Classy.'],
      ['Beautiful. Very classy. Very expensive-looking.'],
      ['The best taste. People say I have the best taste.'],
      ['GORGEOUS! More gold! You can NEVER have too much gold!']
    ),
    noCash: L(
      ['We can’t afford that. That’s alright.'],
      ['A little short right now.'],
      ['We’re a little short. Temporarily. Great credit, though.'],
      ['I’m very rich. It’s just not liquid. Do a deal.'],
      ['I have BILLIONS! Just not HERE! Make a DEAL!']
    ),
    signed: L(
      ['I signed it. I hope my handwriting is legible.'],
      ['Signed. Look at that signature.'],
      ['Look at that. Beautiful signature. Like a heartbeat.'],
      ['Signed. I hold it up so everyone can see. It’s important.'],
      ['SIGNED! The most powerful signature in the WORLD! Look at it!']
    ),
    comeback: L(
      ['I’m back. I’m sorry I left. I missed you.'],
      ['I’m back. Let’s not do that again.'],
      ['I was golfing. I shot a 59. Don’t leave me again.'],
      ['I forgive you. I’m very forgiving. Ask anyone.'],
      ['I’M BACK! I forgive you! Nobody forgives like me. NOBODY!']
    ),
    another: L(
      ['Another term? If people want that, I’d be honored.'],
      ['Another term. Why not.'],
      ['Another term. The people demanded it.'],
      ['Another term! Many people are saying it’s allowed.'],
      ['ANOTHER TERM! They BEGGED me! Who am I to say no?']
    ),
  };

  // What neglect does to him. This is the bad ending: he becomes reasonable.
  C.HUMBLE_LINES = [
    'I’ve been thinking... maybe I’m not always right.',
    'Perhaps the other side has a point.',
    'I don’t need gold. I just need... a snack.',
    'I’m sorry. For everything, really.',
    'Would you like to hear about my feelings?',
    'Maybe I’ll read a book. A whole one.',
    'I should listen more. Don’t you think?',
    'Honestly, the crowd was medium-sized.',
  ];

  C.line = function (key, tier, rng) {
    const set = C.LINES[key];
    if (!set) return '';
    let t = Math.max(0, Math.min(4, tier | 0));
    while (t > 0 && (!set[t] || !set[t].length)) t--;
    const arr = set[t];
    return arr[Math.floor((rng || Math.random)() * arr.length)];
  };
  C.fill = function (text, vars) {
    return String(text).replace(/\{(\w+)\}/g, function (m, k) {
      return vars && vars[k] != null ? vars[k] : m;
    });
  };

  // ---------------------------------------------------------------- food
  // food/ego/fun/glow/energy are the amounts restored; xp is a flat bonus (salad: a penalty).
  C.FOODS = [
    { id: 'hamberder', icon: '🍔', name: 'Hamberder', word: 'hamberder', note: 'On the house. It is always on the house.', cost: 0, food: 28, ego: 2 },
    { id: 'coke', icon: '🥤', name: 'Diet Coke', word: 'Diet Coke', note: 'Brought by button.', cost: 0, food: 5, energy: 12, fun: 3 },
    { id: 'tacobowl', icon: '🥗', name: 'Taco Bowl', word: 'taco bowl', note: 'The tower grill makes the best ones.', cost: 18, food: 35, fun: 8 },
    { id: 'chicken', icon: '🍗', name: 'Bucket of Chicken', word: 'chicken', note: 'Eaten with a knife and fork.', cost: 25, food: 46, glow: -8 },
    { id: 'steak', icon: '🥩', name: 'Well-Done Steak', word: 'steak', note: 'With ketchup. Do not make it weird.', cost: 54, food: 60, ego: 6 },
    { id: 'cake', icon: '🍰', name: 'Chocolate Cake', word: 'cake', note: 'The most beautiful piece you’ve ever seen.', cost: 15, food: 20, fun: 15, ego: 3 },
    { id: 'icecream', icon: '🍨', name: 'Two Scoops', word: 'ice cream', note: 'Everybody else gets one.', cost: 8, food: 14, fun: 18 },
    { id: 'salad', icon: '🥬', name: 'Salad', word: 'salad', note: 'He will remember this.', cost: 12, food: 18, ego: -10, fun: -10, xp: -6, tariff: true },
  ];

  // ---------------------------------------------------------------- grooming
  C.GROOM = [
    { id: 'comb', icon: '🪮', name: 'Comb the Swoop', note: 'Forward, back, and somehow up.', glow: 22, ego: 4, line: 'groomComb' },
    { id: 'spray', icon: '🧴', name: 'Hairspray', note: 'Extra hold. Wind-rated.', glow: 38, line: 'groomSpray' },
    { id: 'bronzer', icon: '🌞', name: 'Bronzer', note: 'For that natural, healthy, traffic-cone glow.', glow: 30, ego: 3, line: 'groomTan' },
  ];

  // ---------------------------------------------------------------- flattery
  // power 1..3 are compliments; power 0 is the mistake of honesty.
  C.COMPLIMENTS = [
    { t: 'Your hands are enormous.', p: 3 },
    { t: 'You’re the most stable genius I know.', p: 3 },
    { t: 'Your crowds are the biggest. Period.', p: 3 },
    { t: 'Nobody knows more about anything than you.', p: 3 },
    { t: 'The hair is real and it’s spectacular.', p: 3 },
    { t: 'You deserve a Nobel Prize. Two, actually.', p: 3 },
    { t: 'Sir, a big strong man just wept with gratitude.', p: 3 },
    { t: 'Your ratings are through the roof.', p: 2 },
    { t: 'That was a perfect phone call.', p: 2 },
    { t: 'You’re winning so much.', p: 2 },
    { t: 'Great deal today, sir.', p: 2 },
    { t: 'Your golf swing is beautiful.', p: 2 },
    { t: 'Everyone’s talking about you.', p: 2 },
    { t: 'Nice tie.', p: 1 },
    { t: 'You look well-rested.', p: 1 },
    { t: 'Good job today.', p: 1 },
    { t: 'Solid effort.', p: 1 },
    { t: 'You’re doing fine.', p: 1 },
    { t: 'You could try listening more.', p: 0 },
    { t: 'Maybe read the whole briefing?', p: 0 },
    { t: 'The crowd was... medium.', p: 0 },
    { t: 'Have you considered a salad?', p: 0 },
    { t: 'Technically, you lost that one.', p: 0 },
  ];
  C.PRAISE_EGO = [-18, 12, 22, 34];

  // ---------------------------------------------------------------- decor
  // Permanent. Each one shows up in the office and nudges the numbers.
  C.DECOR = [
    { id: 'magazine', name: 'Framed Magazine Cover', note: 'He is on it. He had it made.', cost: 80e3, perk: 'Ego fades 5% slower', ego: 0.05 },
    { id: 'trophy', name: 'Club Championship Trophy', note: 'Awarded by his own club. To him.', cost: 250e3, perk: 'Golf pays +25% tremendousness', golf: 0.25 },
    { id: 'tv', name: 'Very Large Television', note: 'Shows the news. The news is him.', cost: 600e3, perk: 'Fun fades 10% slower', fun: 0.10 },
    { id: 'curtains', name: 'Gold Curtains', note: 'Curtains, but gold.', cost: 2.5e6, perk: '+10% income', income: 0.10 },
    { id: 'button', name: 'The Diet Coke Button', note: 'Red. On the desk. Tap it.', cost: 8e6, perk: 'Diet Coke gives +50% energy', coke: 0.5 },
    { id: 'portrait', name: 'Portrait of Himself', note: 'Oil on canvas. Very strong likeness.', cost: 25e6, perk: 'Ego fades 10% slower', ego: 0.10 },
    { id: 'chandelier', name: 'Crystal Chandelier', note: 'The biggest crystals. Tremendous crystals.', cost: 90e6, perk: '+15% income', income: 0.15 },
    { id: 'eagle', name: 'Solid Gold Eagle', note: 'It looks at you. With respect.', cost: 300e6, perk: '+10% tremendousness', xp: 0.10 },
    { id: 'bigportrait', name: 'Bigger Portrait of Himself', note: 'In it, he is admiring the first portrait.', cost: 1e9, perk: 'Ego fades 15% slower', ego: 0.15 },
    { id: 'toilet', name: 'Gold Toilet', note: 'It’s a throne. Technically.', cost: 5e9, perk: 'Glow fades 20% slower', glow: 0.20 },
    { id: 'walls', name: 'Gold Everything', note: 'The walls. The trim. The air, somehow.', cost: 25e9, perk: '+25% income', income: 0.25 },
    { id: 'ballroom', name: 'Big Beautiful Ballroom', note: 'Visible from the window. And from space.', cost: 100e9, perk: '+20% tremendousness', xp: 0.20 },
  ];

  // ---------------------------------------------------------------- posts
  const P = (C.POST = {});
  P.things = ['office', 'golf game', 'hair', 'tie collection', 'burger order', 'signature', 'Sharpie collection', 'ratings', 'crowd', 'handshake', 'vocabulary', 'memory', 'tower'];
  P.activities = ['round of golf', 'phone call', 'lunch', 'rally', 'meeting', 'signing ceremony', 'walk down a ramp', 'press conference'];
  P.topics = ['golf', 'hamburgers', 'buildings', 'tariffs', 'television', 'winning', 'gold', 'deals', 'hairspray', 'the weather', 'ramps', 'windmills', 'water pressure'];
  P.rivals = ['the Teleprompter', 'the Salad', 'the Windmill', 'the Umbrella', 'the Low-Flow Showerhead', 'the Paper Straw', 'the Staircase', 'the Electric Boat', 'the Shark', 'the Treadmill', 'the Briefing Book'];
  P.nicks = ['Sleepy', 'Crooked', 'Low-Energy', 'Little', 'Crazy', 'Wacky', 'Failing', 'Nervous', 'Shifty', 'Lyin’'];
  P.enemies = ['Fake News', 'Haters and Losers', 'Lettuce Lobby', 'Windmill People', 'so-called “experts”'];
  P.closers = ['SAD!', 'Thank you for your attention to this matter!', 'MAKE THE OFFICE GREAT AGAIN!', 'Many people are saying it!', 'Enjoy!', 'We’ll see what happens!', 'Believe me!', 'PERIOD!'];
  P.templates = [
    [
      'Had a pleasant day. Hope everyone is well.',
      'Thank you to my caretaker for lunch. Very kind.',
      'I may have been wrong earlier. Sorry about that.',
      'Reading a book tonight. It’s long, but I’m enjoying it.',
      'Other people have good ideas too. Just a thought.',
      'My {thing} is fine. Nothing special. Have a nice evening.',
    ],
    [
      'Good day today. Things are looking up.',
      'I think I’ve got a knack for {topic}.',
      'Working hard. Big plans. Stay tuned.',
      'My {thing} is coming along nicely. Really nicely.',
      'Had a good {activity}. I think they liked me.',
    ],
    [
      'My {thing} is doing great. Really great. Everyone’s noticing.',
      'Just had a fantastic {activity}. One of the best.',
      'People keep telling me my {thing} is the best they’ve seen. I just listen.',
      '{rival} said I couldn’t do it. Did it anyway. Sad for {rival}!',
      'I know a lot about {topic}. More than most. Maybe more than anyone.',
    ],
    [
      'Many people are saying my {thing} is the best in the country. I don’t say it. They do.',
      '{nick} {rival} is failing badly. I, on the other hand, am doing tremendously. Sad!',
      'Nobody knows more about {topic} than me. Nobody. Ask anyone.',
      'Just finished a perfect {activity}. Perfect. The {enemy} won’t report it.',
      'They say my {thing} can’t get any better. Wrong! It gets better every day.',
    ],
    [
      'The {ENEMY} won’t tell you this, but my {THING} is the GREATEST in the HISTORY of {topic}. {closer}',
      '{NICK} {rival} is a TOTAL DISASTER. Never had my {thing}. Never will! {closer}',
      'Just had a PERFECT {activity}. Not good. PERFECT. Everyone agrees, even the people who don’t! {closer}',
      'I am hereby placing a {n}% TARIFF on {rival}. Effective IMMEDIATELY. {closer}',
      'They’re saying I should be on the MOUNTAIN. I didn’t say it. THEY did. Good idea, though! {closer}',
      'NOBODY knows more about {topic} than me. I practically INVENTED {topic}. {closer}',
      'A big, strong man came up to me, tears in his eyes. “Sir,” he said, “your {thing}.” That’s all he could say! {closer}',
    ],
  ];
  P.covfefe = 'The hamberders were tremendous tonight, despite the constant negative press covfefe';

  C.makePost = function (tier, rng) {
    rng = rng || Math.random;
    const pick = function (a) { return a[Math.floor(rng() * a.length)]; };
    if (rng() < 0.025) return { text: P.covfefe, covfefe: true };
    const t = Math.max(0, Math.min(4, tier | 0));
    const thing = pick(P.things), topic = pick(P.topics), rival = pick(P.rivals), nick = pick(P.nicks), enemy = pick(P.enemies);
    const text = C.fill(pick(P.templates[t]), {
      thing: thing, topic: topic, rival: rival, nick: nick, enemy: enemy,
      THING: thing.toUpperCase(), NICK: nick.toUpperCase(), ENEMY: enemy.toUpperCase(),
      activity: pick(P.activities), closer: pick(P.closers), n: 25 * (2 + Math.floor(rng() * 18)),
    });
    return { text: text.charAt(0).toUpperCase() + text.slice(1), covfefe: false };
  };
  C.likesFor = function (tier, rng) {
    rng = rng || Math.random;
    const r = rng();
    if (tier <= 0) return String(3 + Math.floor(r * 40));
    if (tier === 1) return String(120 + Math.floor(r * 900));
    if (tier === 2) return (10 + Math.floor(r * 90)) + 'K';
    if (tier === 3) return (1 + r * 40).toFixed(1) + 'M';
    return r < 0.3 ? 'ALL OF THEM' : (1 + r * 8).toFixed(1) + ' BILLION';
  };

  // ---------------------------------------------------------------- daily briefing
  // fx: ego/fun/food/glow/energy deltas, xp, cashH (hours of income), ach.
  C.BRIEFINGS = [
    { id: 'pages', title: 'The Briefing Is 40 Pages', text: 'Today’s briefing arrived. It is forty pages long and has no pictures.', choices: [
      { t: 'Shrink it to one page, with pictures', fx: { ego: 10, fun: 12, xp: 30 }, r: 'He reads the whole page. He points at a picture. “That one’s me.”' },
      { t: 'Read all forty pages aloud', fx: { fun: -15, energy: -10, xp: 40 }, r: 'He is asleep by page three. You finish anyway. Somebody should know what’s in it.' },
      { t: 'Just say his name every other sentence', fx: { ego: 22, xp: 34 }, r: 'Riveted. “Best briefing ever. Very well written.”' },
    ] },
    { id: 'sharpie', title: 'The Weather Map', text: 'The forecast map does not show what he said it would show.', choices: [
      { t: 'Hand him the Sharpie', fx: { ego: 14, fun: 14, xp: 36 }, r: 'He extends the storm by 200 miles with one confident loop. “See? I was right.”' },
      { t: 'Hide the Sharpie', fx: { ego: -8, xp: 26 }, r: 'He finds another Sharpie. He has many Sharpies.' },
      { t: 'Tell the weather to cooperate', fx: { fun: 8, ego: 8, xp: 30 }, r: 'You speak sternly to a cloud. He nods. “Strong. I like that.”' },
    ] },
    { id: 'call', title: 'A Leader Is Calling', text: 'The phone is ringing. It is a very important foreign leader.', choices: [
      { t: 'Remind him to say it’s a great relationship', fx: { ego: 12, xp: 34 }, r: '“Great relationship. The best relationship.” He says it eleven times.' },
      { t: 'Let it go to voicemail', fx: { fun: 10, xp: 26 }, r: 'The voicemail greeting is four minutes long and mostly about golf.' },
      { t: 'Tell him it was a perfect call before it happens', fx: { ego: 18, xp: 30 }, r: '“Perfect call.” He hasn’t picked up yet.' },
    ] },
    { id: 'island', title: 'He Wants To Buy An Island', text: 'He has seen a very large island on the map. He would like it.', choices: [
      { t: 'Make an offer', fx: { fun: 14, xp: 34, cashH: -2 }, r: 'They say it is not for sale. “Everything’s for sale.” The deposit is non-refundable.' },
      { t: 'Suggest a smaller island', fx: { ego: -6, xp: 26 }, r: '“Too small. I don’t do small.”' },
      { t: 'Distract him with golf', fx: { fun: 18, xp: 30 }, r: 'It works. It always works.' },
    ] },
    { id: 'shower', title: 'Water Pressure Crisis', text: 'The shower is, in his words, “drip, drip, drip.”', choices: [
      { t: 'Draft an order about showerheads', fx: { glow: 20, ego: 8, xp: 36 }, r: 'Signed in under a minute. The hair has never been so rinsed.' },
      { t: 'Suggest a quick rinse', fx: { glow: 8, ego: -4, xp: 24 }, r: '“Quick? This hair needs VOLUME of water.”' },
      { t: 'Install nine showerheads', fx: { glow: 26, xp: 32, cashH: -1 }, r: 'It sounds like a car wash in there. He emerges magnificent.' },
    ] },
    { id: 'windmill', title: 'A Windmill On The Horizon', text: 'From the window, far away, a single windmill is turning.', choices: [
      { t: 'Close the curtains', fx: { ego: 6, xp: 26 }, r: 'Out of sight. He still knows it’s there.' },
      { t: 'Put a tariff on wind', fx: { fun: 14, ego: 10, xp: 36 }, r: '“Twenty-five percent. On all of it.” The wind does not respond.' },
      { t: 'Tell him it’s a very tall fan', fx: { fun: 10, xp: 30 }, r: '“A fan? For who? Terrible fan.”' },
    ] },
    { id: 'stairs', title: 'The Ramp', text: 'There is a ramp. It is, he says, very steep and very slippery.', choices: [
      { t: 'Walk beside him, slowly', fx: { ego: 8, xp: 30 }, r: 'It takes four minutes. He describes it later as “a sprint.”' },
      { t: 'Suggest the stairs', fx: { ego: -6, energy: -8, xp: 26 }, r: '“Stairs are worse. Everybody knows stairs are worse.”' },
      { t: 'Declare the ramp conquered in advance', fx: { ego: 16, xp: 32 }, r: 'A statement is issued. The ramp has been defeated. Totally.' },
    ] },
    { id: 'ratings', title: 'The Ratings Are In', text: 'Last night’s numbers came in. They are fine. Just fine.', choices: [
      { t: 'Tell him they’re the highest ever', fx: { ego: 24, xp: 34 }, r: '“I knew it. I could feel it.”' },
      { t: 'Tell him the truth', fx: { ego: -14, xp: 30 }, r: 'A long silence. “The numbers are rigged.”' },
      { t: 'Blame the remote control', fx: { ego: 10, fun: 8, xp: 30 }, r: '“Low-energy remote. Get a new one. A gold one.”' },
    ] },
    { id: 'reporter', title: 'A Tough Question', text: 'A reporter has asked a question he did not enjoy.', choices: [
      { t: 'Answer with “the weave”', fx: { fun: 14, ego: 8, xp: 36 }, r: 'Fourteen minutes. Sharks, batteries, a golfer from the 1960s. Somehow he lands it.' },
      { t: 'Call on someone else', fx: { ego: 6, xp: 26 }, r: '“You. No, not you. You.”' },
      { t: 'Compliment his own answer', fx: { ego: 16, xp: 30 }, r: '“Great answer by me. Next.”' },
    ] },
    { id: 'parade', title: 'Birthday Planning', text: 'He would like to discuss his birthday. He has ideas.', choices: [
      { t: 'A parade', fx: { ego: 20, fun: 12, xp: 36, cashH: -2 }, r: 'Tanks are discussed. So are bigger tanks.' },
      { t: 'A modest cake', fx: { food: 15, ego: -8, xp: 24 }, r: '“Modest? Who raised you?” He eats it anyway.' },
      { t: 'A cake shaped like him', fx: { food: 15, ego: 18, xp: 34 }, r: 'He will not let anyone cut it.' },
    ] },
    { id: 'ballroom', title: 'More Gold', text: 'He has looked around the room and concluded there is not enough gold.', choices: [
      { t: 'Gold-leaf the light switches', fx: { ego: 14, xp: 32, cashH: -1 }, r: 'You can no longer find the light switches. Worth it.' },
      { t: 'Tell him gold is a state of mind', fx: { ego: -6, xp: 24 }, r: '“No. It’s a metal.”' },
      { t: 'Hold up a mirror', fx: { ego: 22, xp: 34 }, r: '“There it is. Beautiful.”' },
    ] },
    { id: 'neighbor', title: 'The Neighbor Up North', text: 'He has an idea about the very polite country next door.', choices: [
      { t: 'Offer them statehood', fx: { fun: 14, ego: 8, xp: 34 }, r: 'They decline, politely, in two languages.' },
      { t: 'Ask for the maple syrup first', fx: { food: 12, fun: 8, xp: 30 }, r: 'A crate arrives. He puts it on a steak.' },
      { t: 'Change the subject to hockey', fx: { fun: 10, xp: 26 }, r: '“I’d be great at hockey. I just don’t skate.”' },
    ] },
    { id: 'buttonmoved', title: 'The Button Is Missing', text: 'Someone has moved the red button from the desk.', choices: [
      { t: 'Launch a full investigation', fx: { fun: 12, xp: 34 }, r: 'It was under a newspaper. The newspaper has been fired.' },
      { t: 'Bring him a Diet Coke by hand', fx: { food: 5, energy: 12, ego: 8, xp: 30 }, r: '“Like a peasant. But thank you.”' },
      { t: 'Install a second, backup button', fx: { ego: 12, xp: 32, cashH: -1 }, r: 'There are now two buttons. He presses both.' },
    ] },
    { id: 'tariffday', title: 'Tariff Of The Day', text: 'He woke up wanting to put a tariff on something. Anything.', choices: [
      { t: 'Lettuce', fx: { fun: 14, ego: 8, xp: 34, tariff: 50 }, r: 'Lettuce markets are in turmoil. He has never been happier.' },
      { t: 'Umbrellas', fx: { fun: 12, xp: 32 }, r: '“Never closes right. Never. Fifty percent.”' },
      { t: 'Mondays', fx: { fun: 16, ego: 6, xp: 36 }, r: 'Mondays now cost 40% more. Nobody knows what this means.' },
    ] },
    { id: 'rename', title: 'Renaming Things', text: 'He feels something important should be named after him today.', choices: [
      { t: 'A body of water', fx: { ego: 18, xp: 34 }, r: 'The maps are being reprinted. The fish were not consulted.' },
      { t: 'Monday', fx: { ego: 16, fun: 8, xp: 34 }, r: '“See you next Trumpday.” It is catching on. With him.' },
      { t: 'The moon', fx: { ego: 24, xp: 36 }, r: '“It was already mine. This makes it official.”' },
    ] },
    { id: 'umbrella', title: 'It’s Raining', text: 'He is at the top of the airplane stairs holding an open umbrella.', choices: [
      { t: 'Close it for him', fx: { ego: 6, glow: 10, xp: 28 }, r: 'He watches closely. He learns nothing.' },
      { t: 'Let him handle it', fx: { fun: 12, glow: -10, xp: 32 }, r: 'He sets it down, open, in the doorway, and walks inside. It is still there.' },
      { t: 'Declare umbrellas over', fx: { ego: 12, fun: 8, xp: 32 }, r: '“We’re done with umbrellas. The hair can take it.” It cannot.' },
    ] },
    { id: 'prompter', title: 'The Teleprompter Broke', text: 'Mid-speech, the screen goes blank.', choices: [
      { t: 'Let him wing it', fx: { fun: 18, ego: 10, xp: 36 }, r: 'Ninety minutes later the crowd knows a great deal about toilets.' },
      { t: 'Blame the teleprompter', fx: { ego: 14, xp: 30 }, r: '“Worst teleprompter. I don’t pay the company. I never pay.”' },
      { t: 'Hold up cue cards', fx: { ego: 4, xp: 26 }, r: 'He reads one. It says “PAUSE FOR APPLAUSE.” He reads that out loud.' },
    ] },
    { id: 'prize', title: 'The Prize Committee Hasn’t Called', text: 'He checks the phone again. Nothing from the prize people.', choices: [
      { t: 'Nominate him yourself', fx: { ego: 22, xp: 34 }, r: '“A very credible nomination. Very credible person.”' },
      { t: 'Make a gold replica medal', fx: { ego: 26, xp: 36, cashH: -2 }, r: 'It’s bigger than the real one. He wears it to lunch.' },
      { t: 'Suggest the committee is rigged', fx: { ego: 12, fun: 8, xp: 30 }, r: '“Totally rigged. Everybody knows it.”' },
    ] },
    { id: 'exercise', title: 'Exercise Has Been Suggested', text: 'A doctor mentioned exercise. He looked at the doctor for a long time.', choices: [
      { t: 'Count golf as exercise', fx: { fun: 16, ego: 8, xp: 34 }, r: 'In a cart. With a snack. Extremely aerobic.' },
      { t: 'Explain the battery theory', fx: { ego: 10, xp: 30 }, r: '“You’re born with a certain amount of energy. Why waste it?” The doctor writes this down.' },
      { t: 'A treadmill', fx: { energy: -14, ego: -6, xp: 26 }, r: 'He stands on it for a photo. It is not turned on.' },
    ] },
    { id: 'cabinet', title: 'The Meeting', text: 'Everyone at the long table is waiting for the meeting to begin.', choices: [
      { t: 'Go around the table for compliments', fx: { ego: 26, xp: 36 }, r: 'Forty minutes of gratitude. “Great meeting. Very productive.”' },
      { t: 'Start with the agenda', fx: { ego: -6, fun: -6, xp: 28 }, r: 'There was an agenda? He turns it over and draws a tower.' },
      { t: 'Serve hamberders', fx: { food: 25, fun: 8, xp: 32 }, r: 'Stacked on silver trays, under candlelight. Elegant.' },
    ] },
  ];
  C.SEASON_BRIEFINGS = {
    turkey: { id: 'turkey', title: 'The Turkey Pardon', text: 'Two turkeys have been brought to the office. Only one can receive the official pardon.', choices: [
      { t: 'Pardon the big one, “Gobble”', fx: { ego: 14, fun: 16, xp: 50, ach: 'turkey' }, r: '“A full and complete pardon. He’s a winner. Look at the size of him.”' },
      { t: 'Pardon the small one, “Waddle”', fx: { ego: 8, fun: 18, xp: 50, ach: 'turkey' }, r: '“Low energy bird. But loyal. I like loyal.”' },
      { t: 'Pardon both, and himself, just in case', fx: { ego: 22, fun: 12, xp: 50, ach: 'turkey' }, r: '“Everybody’s pardoned. Me most of all. Beautiful ceremony.”' },
    ] },
    birthday: { id: 'birthday', title: 'His Birthday', text: 'It is June 14th. He has mentioned it nine times before breakfast.', choices: [
      { t: 'Parade', fx: { ego: 30, fun: 20, xp: 60 }, r: 'It goes past the window twice. He salutes everything.' },
      { t: 'Cake with far too many candles', fx: { food: 25, ego: 16, fun: 16, xp: 60 }, r: '“That is NOT the right number of candles. Fewer.”' },
      { t: 'Sing', fx: { ego: 24, fun: 14, xp: 60 }, r: 'He conducts. He also sings the loudest. To himself.' },
    ] },
  };

  // ---------------------------------------------------------------- executive orders (collectibles)
  C.ORDERS = [
    ['Diet Coke Shall Be the National Beverage', 'Served cold. By button.'],
    ['Renaming Monday “Trumpday”', 'The other six days are under review.'],
    ['Maximum Water Pressure for All', 'Drip, drip, drip is hereby over.'],
    ['Windmills Are Declared Ugly', 'And noisy. And rude to birds.'],
    ['A 145% Tariff on Lettuce', 'Croutons are exempt.'],
    ['A Total Ban on Low Energy', 'High energy only. Effective now.'],
    ['Making Ties Long Again', 'The floor is the limit.'],
    ['The Strategic Hairspray Reserve', 'One billion cans. Minimum.'],
    ['“Covfefe” Is Hereby a Word', 'Definition: classified.'],
    ['Golf Counts as Exercise', 'Carts included.'],
    ['Two Scoops for Me, One for Everyone Else', 'Fair and balanced.'],
    ['Paper Straws Are Fired', 'They know what they did.'],
    ['The Sharpie Is Mightier Than the Forecast', 'Maps may be corrected by hand.'],
    ['Staircases Shall Be Less Steep', 'Ramps shall be less slippery.'],
    ['All Briefings Must Fit on One Page', 'With pictures. Of him.'],
    ['The National Day of Winning', 'Observed daily.'],
    ['Umbrellas May Be Left Where They Stand', 'Somebody else will get it.'],
    ['Ketchup Goes on Steak', 'This is not a debate.'],
    ['Bigger Buttons for All Desks', 'His is still the biggest.'],
    ['A Feasibility Study for the Mountain', 'Fifth face. Room on the left.'],
    ['Teleprompters Must Keep Up', 'Or be replaced by a better, faster teleprompter.'],
    ['Mandatory Standing Ovations', 'Sitting ovations are a disgrace.'],
    ['Stable Genius Day', 'A day to celebrate one specific genius.'],
    ['National Hamberder Day', 'Spelled exactly like that.'],
    ['Light Bulbs Must Be Flattering', 'No more looking orange. It’s the bulbs.'],
    ['Sharks Shall Keep Their Distance', 'Especially from electric boats.'],
    ['All Toilets: One Flush', 'Not ten. Not fifteen. One.'],
    ['Gold Is the National Color', 'Red, white, blue, and gold.'],
    ['The Weave Is Recognized as an Art Form', 'Nine topics, one sentence, perfect landing.'],
    ['Naps Do Not Exist', 'He was resting his eyes. Powerfully.'],
    ['Crowd Sizes Shall Be Rounded Up', 'To the nearest million.'],
    ['The Best Words Registry', 'Tremendous. Beautiful. Bigly. Filed.'],
    ['Signatures Must Be Displayed', 'Hold it up. Turn slowly. Both sides of the room.'],
    ['Dishwashers Will Wash Dishes', 'On the first try.'],
    ['Renaming the Break Room “Mar-a-Lunchroom”', 'Members only.'],
    ['Every Building Gets His Name', 'Including this one. And that one.'],
  ].map(function (o, i) { return { id: i, no: 14000 + i * 7 + 1, title: o[0], note: o[1] }; });

  // ---------------------------------------------------------------- achievements
  C.ACHIEVEMENTS = [
    { id: 'hatched', icon: '🥚', name: 'A Small Loan', desc: 'Hatch your Trumpagotchi.' },
    { id: 'burger10', icon: '🍔', name: 'Hamberder Helper', desc: 'Serve 10 hamberders.' },
    { id: 'burger100', icon: '🍔', name: 'Billions Served', desc: 'Serve 100 hamberders.' },
    { id: 'coke12', icon: '🥤', name: 'Twelve a Day', desc: '12 Diet Cokes in a single day.' },
    { id: 'salad', icon: '🥬', name: 'Radical Left Lettuce', desc: 'Dare to serve a salad.' },
    { id: 'tariff', icon: '📈', name: 'Tariff Man', desc: 'Push the lettuce tariff past 500%.' },
    { id: 'golfhio', icon: '⛳', name: 'Witnessed by Nobody', desc: 'Sink all three putts in one round.' },
    { id: 'golf10', icon: '🏆', name: 'Club Champion', desc: 'Play 10 rounds of golf.' },
    { id: 'dealbig', icon: '🤝', name: 'The Art of It', desc: 'Close a deal after 4 or more demands.' },
    { id: 'dealwalk', icon: '🚪', name: 'We’ll See What Happens', desc: 'Have a buyer walk out.' },
    { id: 'rallybig', icon: '📣', name: 'Largest Crowd Ever. Period.', desc: 'Pack a rally (60+ cheers).' },
    { id: 'post1', icon: '📱', name: 'Thank You for Your Attention', desc: 'Publish his first post.' },
    { id: 'post50', icon: '📱', name: 'Prolific', desc: 'Publish 50 posts.' },
    { id: 'covfefe', icon: '❓', name: 'Covfefe', desc: 'Witness the typo.', secret: true },
    { id: 'post3am', icon: '🌙', name: '3 AM', desc: 'He posted in the middle of the night.', secret: true },
    { id: 'fired', icon: '👉', name: 'You’re Fired!', desc: 'Say something honest.' },
    { id: 'hair', icon: '💇', name: 'Don’t Touch the Hair', desc: 'Touch the hair 10 times.' },
    { id: 'humble', icon: '🙏', name: 'A Moment of Humility', desc: 'Neglect him until he becomes reasonable.', secret: true },
    { id: 'comeback', icon: '🔄', name: 'He Came Back', desc: 'Win him back after he storms off.', secret: true },
    { id: 'streak3', icon: '🔥', name: 'Loyal', desc: 'Visit 3 days in a row.' },
    { id: 'streak7', icon: '🔥', name: 'Very Loyal', desc: 'Visit 7 days in a row.' },
    { id: 'streak30', icon: '🔥', name: 'Tremendously Loyal', desc: 'Visit 30 days in a row.' },
    { id: 'streak100', icon: '👑', name: 'Loyalty Like Nobody’s Ever Seen', desc: 'Visit 100 days in a row.' },
    { id: 'decor1', icon: '🖼️', name: 'Interior Decorator', desc: 'Buy your first piece of decor.' },
    { id: 'decor6', icon: '✨', name: 'Classy', desc: 'Own 6 pieces of decor.' },
    { id: 'decor12', icon: '💎', name: 'Gold Everything', desc: 'Own all the decor.' },
    { id: 'orders10', icon: '🖊️', name: 'Executive Time', desc: 'Collect 10 executive orders.' },
    { id: 'ordersall', icon: '📜', name: 'Rule by Sharpie', desc: 'Collect every executive order.' },
    { id: 'billion', icon: '💰', name: 'Really Rich', desc: 'Hold $1 billion.' },
    { id: 'lv45', icon: '🇺🇸', name: 'Mr. President', desc: 'Reach level 45.' },
    { id: 'lv47', icon: '🇺🇸', name: 'The Comeback', desc: 'Reach level 47.' },
    { id: 'lv50', icon: '🗿', name: 'Tremendous Form', desc: 'Reach level 50.' },
    { id: 'term2', icon: '🗳️', name: 'Four More Years', desc: 'Start a second term.' },
    { id: 'term3', icon: '🗳️', name: 'Many People Are Saying It’s Allowed', desc: 'Start a third term.' },
    { id: 'turkey', icon: '🦃', name: 'Pardoned', desc: 'Pardon a Thanksgiving turkey.', secret: true },
  ];

  // ---------------------------------------------------------------- seasons
  C.SEASONS = {
    newyear: { name: 'New Year', greet: 'HAPPY NEW YEAR! It will be the best year. I already decided.' },
    inaug: { name: 'Inauguration Day', greet: 'Inauguration Day! The crowd was the biggest. You saw the pictures. Don’t look at the pictures.' },
    valentine: { name: 'Valentine’s Day', greet: 'Happy Valentine’s Day. I sent myself a card. Beautiful card.' },
    presidents: { name: 'Presidents’ Day', greet: 'Presidents’ Day! A day about presidents. One in particular.' },
    birthday: { name: 'His Birthday', greet: 'IT’S MY BIRTHDAY! Also some flag thing. But mostly my birthday!' },
    july4: { name: 'The Fourth of July', greet: 'Happy Fourth! The fireworks are for the country. And a little for me.' },
    halloween: { name: 'Halloween', greet: 'Happy Halloween. I’m going as myself. Scariest costume, they tell me.' },
    turkey: { name: 'Thanksgiving', greet: 'Happy Thanksgiving! I’m thankful for me. And the turkey. Mostly me.' },
    christmas: { name: 'Christmas', greet: 'MERRY CHRISTMAS! We’re saying it again. I brought it back. You’re welcome!' },
  };
  C.seasonFor = function (d) {
    const m = d.getMonth() + 1, day = d.getDate(), y = d.getFullYear();
    const nthDow = function (month, dow, n) { // n-th weekday of a month (1-based month)
      const first = new Date(y, month - 1, 1).getDay();
      return 1 + ((dow - first + 7) % 7) + (n - 1) * 7;
    };
    if (m === 1 && day === 1) return 'newyear';
    if (m === 1 && day === 20) return 'inaug';
    if (m === 2 && day === 14) return 'valentine';
    if (m === 2 && day === nthDow(2, 1, 3)) return 'presidents';
    if (m === 6 && day === 14) return 'birthday';
    if (m === 7 && day === 4) return 'july4';
    if (m === 10 && day === 31) return 'halloween';
    if (m === 11) { const tg = nthDow(11, 4, 4); if (day >= tg - 6 && day <= tg) return 'turkey'; }
    if (m === 12 && day <= 26) return 'christmas';
    return null;
  };

  // ---------------------------------------------------------------- away-time flavor
  C.AWAY_EVENTS = [
    'He fired {n} imaginary staffers.',
    'He practiced his signature {n} times.',
    'He watched {n} hours of television about himself.',
    'He rearranged the gold.',
    'He stared down a windmill.',
    'He told a mirror it was doing a great job.',
    'He renamed the stapler after himself.',
    'He gave the desk a nickname. It was not a kind one.',
    'He declared victory over a crossword.',
    'He asked where you were {n} times.',
  ];

  C.DEAL_BUYERS = ['A Guy From Queens', 'A Very Rich Friend', 'The Hotel People', 'A Mysterious Prince', 'Some Golf Guys', 'A Casino Enthusiast', 'The Steak Consortium', 'A Man With A Briefcase'];
  C.DEAL_ITEMS = ['naming rights to a tower', 'a slightly used golf course', 'a line of extra-long ties', 'a very luxurious steak brand', 'gold sneakers', 'a signed Sharpie', 'the penthouse (not the good one)', 'a board game about himself'];
})(typeof window !== 'undefined' ? window : globalThis);
