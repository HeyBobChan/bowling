/* Trumpagotchi — content: every word he says, everything he owns, everything he signs.
   Parody. All "quotes" are invented for a cartoon pet. */
(function (root) {
  'use strict';
  const TG = (root.TG = root.TG || {});
  const C = (TG.content = {});

  // ---------------------------------------------------------------- stages
  // He starts out polite and reasonable. Care makes him... more.
  // Past level 50 there is no more president to become, so he becomes other things.
  C.MAX_LEVEL = 100;
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
    { id: 'plated', min: 55, name: 'Gold Standard', blurb: 'Had himself gold-plated, head to toe. He calls it natural.' },
    { id: 'hair', min: 62, name: 'The Hair', blurb: 'The hair is bigger than he is. It makes the decisions now.' },
    { id: 'tie', min: 70, name: 'The Long Tie', blurb: 'The tie has been all the way round. It left by one door and came back in by the other.' },
    { id: 'giant', min: 78, name: 'The Biggest', blurb: 'Outgrew the office, then the street. The city is being very nice about it.' },
    { id: 'tower', min: 86, name: 'The Tower', blurb: 'He and the building have merged. His name was already on it.' },
    { id: 'planet', min: 93, name: 'The Orange Giant', blurb: 'A planet. Astronomers confirm it is “the big orange one”.' },
    { id: 'all', min: 100, name: 'The Everything', blurb: 'There is no office. There is no outside. There is only him.' },
  ];
  C.TIER_NAMES = ['Humble', 'Confident', 'Boastful', 'Tremendous', 'MAXIMUM', 'BEYOND'];
  C.tierForLevel = function (lv) {
    return lv >= 62 ? 5 : lv >= 45 ? 4 : lv >= 32 ? 3 : lv >= 17 ? 2 : lv >= 5 ? 1 : 0;
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
    plated: 'I’m GOLD now! Solid! Well, plated. Same thing! Don’t SCRATCH it!',
    hair: 'The hair has an announcement. I work for the HAIR now. Great boss. The BEST!',
    tie: 'The tie went ALL the way round! Out that side, back in THIS side! Longest tie in HISTORY!',
    giant: 'Too BIG for the office! Too big for the BUILDING! Finally, a size that FITS!',
    tower: 'I AM the building now! Ninety floors! Every one of them the TOP floor!',
    planet: 'I’m a PLANET! The BIGGEST! The other planets are FURIOUS!',
    all: 'I AM EVERYTHING NOW! Look up! That’s me. Look down! ALSO me!',
  };

  // ---------------------------------------------------------------- his voice
  // Five registers per situation: humble, confident, boastful, tremendous, MAXIMUM.
  const L = function (t0, t1, t2, t3, t4) { return [t0, t1, t2, t3, t4]; };
  C.LINES = {
    greet: L(
      ['Oh, hello. Nice to see you again.', 'Hi. I hope I’m not bothering you.', 'You came back. That’s very kind of you.', 'Hello! I tidied up a little while you were out.', 'Good to see you. I didn’t touch anything.'],
      ['You’re back. Good. I had some ideas.', 'There you are. Let’s get to work.', 'Good timing. I was just thinking about me.', 'Back already? Smart. Things happen here.', 'Hey. I’ve been busy. Good busy.'],
      ['You’re back! Smart. Very smart of you.', 'Welcome back. I’ve been doing great, by the way. Really great.', 'Look who’s here. You picked a great day. Every day is.', 'Good, you’re here. I did some winning while you were gone.', 'You’re back. I kept the place beautiful. Look at it.'],
      ['Look who’s back! Everyone comes back. Everyone.', 'You missed me. I can tell. People always miss me.', 'You’re back. The office is setting records. Ask anyone.', 'There you are. I told them you’d be back. I’m always right.', 'Welcome back to the best-run office anywhere. Believe me.'],
      ['THE GREATEST CARETAKER RETURNS! Well, second greatest. After me.', 'WELCOME BACK! It was TREMENDOUS without you. Even better with you. Maybe.', 'YOU’RE BACK! Just in time for more WINNING!', 'LOOK WHO IT IS! My FAVORITE caretaker! Don’t tell the others!', 'BACK AGAIN! Nobody stays away. NOBODY!']
    ),
    greetLong: L(
      ['You were gone a while. That’s okay. I understand.', 'I wondered if you’d forgotten me. It’s fine if you did.', 'Welcome back. I kept myself busy. Quietly.'],
      ['Where were you? I waited. Patiently, I’d say.', 'Long time. I managed. Mostly.', 'You took your time. I noticed.'],
      ['You were gone forever. Not nice. Not nice at all.', '{hours} hours. I counted. I’m a great counter.', 'I had to compliment myself the whole time. Exhausting.'],
      ['Where WERE you? Very disloyal. I’m watching you.', '{hours} hours without applause. Can you imagine?', 'I almost replaced you. I had a list. A very good list.'],
      ['{hours} HOURS! Very unfair treatment. Worst absence in HISTORY. Now feed me!', 'GONE for {hours} HOURS! A total DISGRACE! ...I missed you. Don’t tell anyone.', 'FINALLY! I was about to put a TARIFF on your absence!']
    ),
    greetMorning: L(
      ['Good morning. I slept fine, thank you for asking.', 'Morning. I hope you slept well.', 'Good morning. I made the bed. Sort of.'],
      ['Morning. Big day. I can feel it.', 'Good morning. I’m ready. Are you ready?', 'Up and at it. I’ve got a good feeling.'],
      ['Good morning! I slept great. The best sleep.', 'Morning. I already won twice today. In my head.', 'Good morning. I look rested. I always look rested.'],
      ['I barely slept. Didn’t need to. Tremendous stamina.', 'Good morning. I’ve been up for hours, winning.', 'Morning! The birds were singing about me. I heard them.'],
      ['GOOD MORNING to everyone, even the HATERS and LOSERS!', 'A BEAUTIFUL morning! The BEST morning! I ordered it myself!', 'RISE AND SHINE! Mostly SHINE. That’s me!']
    ),
    idleHappy: L(
      ['This is nice. Thank you for looking after me.', 'I’m content. Is that okay to say?', 'I think I’m doing an adequate job.', 'I hope I’m not taking up too much room.', 'Lovely day. I don’t deserve it, but here we are.',
        'I was just admiring the window. It’s a good window.', 'If you need the desk, I can move.', 'I read a pamphlet today. Cover to cover.', 'I’m happy when you’re happy.', 'Is my tie alright? I tied it myself.'],
      ['I’m doing well. Really well, actually.', 'I’ve got good instincts. Always have.', 'I could run this place. Just saying.', 'People like me. I’ve noticed that.', 'I had an idea. A pretty good one.',
        'I look good today. Not bragging. Just noticing.', 'This office has potential. Like me.', 'I’m thinking bigger. You should too.', 'I shook a guy’s hand today. Firm. He remembered it.', 'Somebody should write this down.'],
      ['Everything’s going great. Everyone says so.', 'I have the best office. Look at it. Beautiful.', 'Nobody does it better than me. Nobody.', 'I have the best words. I really do.', 'I’d put my name on this room. Maybe I will.',
        'I know quality. I am quality.', 'They’ll make a show about this. Great ratings.', 'My instincts are incredible. They’re never wrong. Almost never. Never.', 'I just had a great thought. All my thoughts are great.', 'You’re lucky to be here. I’m lucky too. Mostly you.'],
      ['We’re winning so much. Aren’t you tired of winning?', 'Many people are saying this is the best-run office ever.', 'I know more about offices than anybody. Believe me.', 'A very stable genius lives here. Me. It’s me.', 'They’re talking about us everywhere. Good things. The best things.',
        'Nobody’s ever seen anything like this. That’s what they tell me.', 'I aced a test once. Five words. In order. They were amazed.', 'I could stand in the middle of this office and everyone would clap.', 'People call. They say, “Sir, how do you do it?” I say, “Talent.”', 'Frankly, I’m a little too good at this.'],
      ['We are WINNING like NEVER BEFORE! Thank you for your attention to this matter!', 'TREMENDOUS things are happening. The likes of which NOBODY has ever seen!', 'They said it couldn’t be done. I did it. In RECORD time!', 'Strong men come up to me, tears in their eyes. “Sir,” they say. EVERY time!', 'This is the GREATEST office in the HISTORY of offices! Maybe of ANYTHING!',
        'Everything is PERFECT. I checked. PERFECT!', 'They’re measuring the MOUNTAIN. For ME. I heard it from very good people!', 'The numbers are INCREDIBLE. All of them. Even the ones we don’t have yet!', 'BEAUTIFUL. Just BEAUTIFUL. I’m talking about ME!', 'Person. Woman. Man. Camera. TV. Still got it. A PERFECT score!']
    ),
    hungry: L(
      ['Sorry to bother you, but I’m a little hungry.', 'Could I maybe have something to eat? If it’s no trouble.', 'My stomach made a noise. I apologize.', 'Anything is fine. Even a small thing.'],
      ['I could eat. I could definitely eat.', 'Is it lunch? It feels like lunch.', 'A burger would be good right about now.', 'I think better on a full stomach.'],
      ['I’m hungry. Where’s my burger? I was promised burgers.', 'A man of my caliber shouldn’t have to ask twice.', 'I’m wasting away. Look at me. Still great, but wasting.', 'Somebody get me a hamberder. A good one.'],
      ['No food! Can you believe it? A disgrace. Get me a hamberder.', 'I’ve never been treated so hungrily. Nobody has.', 'They feed everyone else. Very unfair.', 'Hungry! Worst kitchen in the country, and I’ve seen kitchens.'],
      ['I am STARVING! The WORST food shortage in the history of this office!', 'HAMBERDERS. NOW. Thank you!', 'My patience is OVER! Completely OVER! Until I get a BURGER!', 'FEED ME! Thank you for your attention to this matter!']
    ),
    bored: L(
      ['I wouldn’t mind doing something. Whenever you have time.', 'I counted the ceiling tiles. There are a few.', 'Maybe a little game? Only if you want.', 'I’ll just stand here. That’s fine too.'],
      ['It’s quiet. Too quiet. Let’s do a deal or something.', 'I’ve got energy to burn.', 'Let’s make something happen.', 'A round of golf wouldn’t kill anybody.'],
      ['I’m bored. Let’s golf. I’m a great golfer, you know.', 'Nothing’s happening. I make things happen. Let me.', 'A deal. A rally. Something with applause.', 'This is beneath my talents. Entertain me.'],
      ['Boring! This is low energy. Get me to a golf course.', 'I haven’t won anything in minutes. Unacceptable.', 'Where’s the crowd? There’s supposed to be a crowd.', 'So boring. The most boring it’s ever been. Fix it.'],
      ['So BORING! Schedule a RALLY. Or golf. Or a rally AT golf!', 'LOW ENERGY in here! I need a DEAL! A BIG one!', 'NOTHING is happening! That’s NEVER happened before!', 'I am BORED. BIGLY. Do something!']
    ),
    needEgo: L(
      ['Do you think I’m doing okay? Be honest.', 'I hope I’m not a disappointment.', 'A kind word would be nice. No pressure.', 'Am I any good at this? You can tell me.'],
      ['Say something nice. I’ve earned it.', 'A little appreciation goes a long way.', 'I did good today. Somebody should mention it.', 'Nobody’s noticed my tie. It’s a good tie.'],
      ['Nobody’s told me I’m great in almost an hour. Weird.', 'I’m still incredible. Just checking that you know.', 'It’s been quiet. Too quiet for someone this good.', 'Feel free to say something. About me. Good things.'],
      ['Where’s the applause? There’s usually applause.', 'People used to line up to compliment me. Around the block.', 'I shouldn’t have to say it myself. But I will. I’m great.', 'Very little praise today. Very unfair.'],
      ['My ratings are DOWN! Rigged! Somebody tell me I’m the best. QUICKLY!', 'NOBODY has praised me in MINUTES! A NATIONAL DISGRACE!', 'SAY IT! Say I’m TREMENDOUS! Everyone else does!', 'The applause has STOPPED! Who STOPPED it?!']
    ),
    needGlow: L(
      ['My hair’s a bit of a mess. Sorry about that.', 'I think I look a little tired. Do I?', 'I should comb this. I keep forgetting.', 'I caught my reflection. I looked away.'],
      ['I need a comb. A man needs a comb.', 'The hair’s not sitting right.', 'I’m looking a little flat. Let’s fix it.', 'A touch-up wouldn’t hurt.'],
      ['The hair isn’t right. It has to be right.', 'I’m not at full glow. People will notice.', 'This is not my best look. And I only have best looks.', 'Get the spray. The good spray.'],
      ['I’m looking pale. PALE! Get the bronzer.', 'The swoop is drooping. This cannot stand.', 'I look almost ordinary. Do something.', 'They’ll take pictures. I need the glow.'],
      ['The hair is DEFLATING! This is a NATIONAL EMERGENCY!', 'I am losing the GLOW! Get the BRONZER! ALL of it!', 'The SWOOP has FALLEN! Raise it IMMEDIATELY!', 'I look NORMAL! This is the WORST thing that has EVER happened!']
    ),
    tired: L(
      ['I’m getting sleepy. Is it bedtime?', 'I might close my eyes for a moment. Sorry.', 'It’s been a long day. A nice one.', 'I could use a rest, if that’s alright.'],
      ['Long day. I could use some rest.', 'I’m running low. Not empty. Low.', 'Let’s wrap it up soon.', 'A little sleep and I’ll be even better.'],
      ['I’m not tired. I’m never tired. ...Maybe a little.', 'My eyes are resting. I’m still listening.', 'Even the best need to recharge. Briefly.', 'I’ve been great all day. It takes a lot out of you.'],
      ['Low energy is for other people. But dim the lights anyway.', 'I’m not yawning. That’s a power breath.', 'I could go all night. I just don’t want to.', 'Bring me a Diet Coke or a pillow. Your call.'],
      ['I have the BEST stamina. Tremendous. Now turn off the lights. Quietly!', 'NOT tired! Just resting my eyes. POWERFULLY!', 'I NEVER sleep! ...Wake me in four hours!', 'So much WINNING. Even I need to lie down!']
    ),
    ate: L(
      ['Thank you. That {food} was very nice.', 'Mm. I appreciate the {food}.', 'Oh, {food}. You shouldn’t have.', 'That was plenty. Thank you.', 'Delicious. May I be excused?'],
      ['Good {food}. Really good.', 'That hit the spot. Good {food}.', 'Now that’s what I call {food}.', 'Good {food} is good {food}. I always say that.', 'Solid {food}. I’d order it again.'],
      ['Great {food}. One of the best I’ve had. And I’ve had a lot.', 'I know {food}. That was great {food}.', 'That {food}? Fantastic. I have great taste.', 'Very classy {food}. I could tell right away.', 'People don’t know how good {food} can be. I know.'],
      ['Tremendous {food}. Nobody eats {food} like me. Nobody.', 'Best {food} in the country. Maybe the world. They tell me.', 'That {food} was so good. Everybody’s talking about it.', 'I may be the greatest {food} eater of all time.', 'The {food} was perfect. Like everything I do.'],
      ['The GREATEST {food} in the HISTORY of {food}! People are saying it!', 'WOW! That {food}! UNBELIEVABLE! A TEN!', 'They don’t make {food} like that anymore. I DO!', 'PERFECT {food}! Thank you for your attention to this {food}!', 'INCREDIBLE {food}! I’m naming it after MYSELF!']
    ),
    // A few foods get lines of their own; the rest use the general ones above.
    ate_steak: L(
      ['Oh my. Steak. This is too generous.', 'Well done? Whatever is easiest for the kitchen.'],
      ['Good steak. Cooked all the way. The right way.', 'Pass the ketchup, please.'],
      ['Well done, with ketchup. People laugh. Then they try it.', 'A steak like me: no pink, all class.'],
      ['The chef wanted medium rare. The chef is no longer with us. Different restaurant.', 'Ketchup on steak. The experts hate it. The experts are wrong.'],
      ['WELL DONE! Like EVERYTHING I do!', 'KETCHUP ON STEAK! It’s called WINNING!']
    ),
    ate_chicken: L(
      ['A whole bucket? I’ll save some for later.', 'Thank you. I’ll use a napkin.'],
      ['Good chicken. Crispy.', 'I’ll use a knife and fork. It’s cleaner.'],
      ['Knife and fork, like a gentleman. A bucket is fine dining if I’m holding it.', 'Eleven secret herbs. I know at least twelve.'],
      ['I eat it with silverware. They mock me. They’re jealous of the silverware.', 'Greasy fingers ruin the hair. Everyone knows that.'],
      ['The BUCKET is EMPTY! I WON the bucket!', 'FRIED CHICKEN on FINE CHINA! That’s CLASS!']
    ),
    ate_tacobowl: L(
      ['A taco in a bowl. How clever. Thank you.', 'Is the bowl edible? I don’t want to be rude.'],
      ['Good taco bowl. You eat the bowl. Smart design.'],
      ['The best taco bowls are made in my building. Everybody knows it.'],
      ['I ate the bowl. Total commitment. That’s leadership.'],
      ['The TACO BOWL! A BOWL you can EAT! GENIUS! Probably MINE!']
    ),
    ate_cake: L(
      ['Cake? Is it somebody’s birthday? Thank you.', 'Just a small slice. Oh, that is the small slice. Okay.'],
      ['Good cake. Chocolate. Can’t go wrong.'],
      ['A beautiful piece of chocolate cake. I know a beautiful cake when I see one.'],
      ['The most beautiful piece of chocolate cake you’ve ever seen. And I ate it.'],
      ['The MOST BEAUTIFUL chocolate cake in the WORLD! Big decisions get made over cake like this!']
    ),
    ate_icecream: L(
      ['One scoop is plenty. Oh, two? That’s too kind.'],
      ['Two scoops. I could get used to this.'],
      ['Two scoops for me. One for everyone else. That’s just fair.'],
      ['Everybody else gets one scoop. I checked. Good system.'],
      ['TWO SCOOPS! I EARNED the second scoop! By being ME!']
    ),
    ateCoke: L(
      ['A soda? How thoughtful.', 'Bubbles! Thank you.', 'I’ll sip it slowly.'],
      ['Diet Coke. Good choice.', 'Cold. Crisp. Good.', 'That’s the stuff.'],
      ['Diet Coke. I should get a button for this. A big one.', 'Number {n}. I’m pacing myself.', 'Diet Coke: the drink of winners. One winner, mainly.'],
      ['That’s number {n} today. I’m very disciplined.', '{n} Diet Cokes. It’s called hydration.', 'Diet. Because I’m an athlete.'],
      ['DIET COKE NUMBER {n}! A PERFECT beverage!', 'NUMBER {n}! The button WORKS!', '{n} today! A NEW RECORD! By ME!']
    ),
    ateSalad: L(
      ['Oh, a salad. That’s healthy. Thank you!', 'Leaves! Crunchy. Very thoughtful.', 'I do like a cucumber.'],
      ['Salad. Hm. Okay. I’ll eat around it.', 'Is there a burger under this?', 'Green. Very green.'],
      ['A salad? What is this, a punishment?', 'I’ll eat it. But I’ll remember.', 'This is what food eats.'],
      ['Lettuce! Very unfair. I’m putting a tariff on this. {tariff}%.', 'A salad. From my own caretaker. {tariff}% tariff. Effective now.', 'They sent leaves. I’m sending a {tariff}% tariff.'],
      ['RADICAL LEFT LETTUCE! {tariff}% TARIFF, effective IMMEDIATELY!', 'A SALAD?! The tariff is now {tariff}%! And RISING!', 'LEAVES! On MY plate! {tariff}% TARIFF! Thank you for your attention to this matter!']
    ),
    full: L(
      ['No thank you, I couldn’t possibly eat more.', 'I’m quite full. Thank you, though.', 'Maybe save it for someone hungrier.'],
      ['I’m full. Maybe later.', 'Not right now. I’m good.', 'Hold that thought. And that burger.'],
      ['I’m full. First time that’s ever happened.', 'Even greatness has a capacity.', 'Later. I’m digesting a victory.'],
      ['Even I have limits. Very few. This is one.', 'I’m full. The fullest. Nobody’s been this full.', 'Not now. I ate like a champion already.'],
      ['FULL! The most full anyone has EVER been!', 'NO MORE! I have WON lunch!', 'I am at CAPACITY! A RECORD capacity!']
    ),
    praised: L(
      ['Oh! That’s very kind. I don’t know what to say.', 'You really think so? Thank you.', 'I’m blushing. Is that noticeable?', 'That means a lot. I’ll try to live up to it.', 'Me? Surely you mean someone else.'],
      ['I appreciate that. It’s true, too.', 'Thank you. I’ve been working on it.', 'Nice of you to notice.', 'Keep going. I’m listening.', 'I thought so too. Good to hear it.'],
      ['True. Very true. You have great judgment.', 'You know quality when you see it.', 'Correct. Say it louder.', 'I’ve been saying that for years.', 'That’s what everyone tells me. You said it nicely.'],
      ['So true. Everybody says it. You said it best, though.', 'Finally. Somebody who gets it.', 'You’re a very smart person. I can tell, because you agree with me.', 'They should put that on a plaque.', 'True. All of it. Even the parts you left out.'],
      ['CORRECT! Finally, somebody HONEST! You’re hired!', 'YES! Write that down! Put it on a BUILDING!', 'SO TRUE! The TRUEST thing ever said!', 'THANK YOU! You are now my FAVORITE!', 'EXACTLY! Tell EVERYONE! Start with THEM!']
    ),
    insulted: L(
      ['You’re right. I’ll try to do better.', 'Oh. That’s fair. Thank you for telling me.', 'I needed to hear that. I think.'],
      ['Hm. I don’t love that.', 'That stung a little.', 'I’ll pretend I didn’t hear that.'],
      ['Wrong. And frankly, rude.', 'I don’t know where you’re getting your information.', 'That’s not what the others say. The others are nicer.'],
      ['Nasty! A very nasty thing to say.', 'Who told you that? Give me a name.', 'Disloyal. Very disloyal. I’m writing it down.'],
      ['YOU’RE FIRED! ...Fine, you’re rehired. But WATCH IT!', 'FAKE NEWS! From my OWN caretaker!', 'WRONG! TOTALLY WRONG! Get out! ...Come back. Bring a burger.']
    ),
    notNeeded: L(
      ['I’m okay for now, thank you.', 'That’s alright. Save it.', 'I’m all set. You’re very attentive.'],
      ['I’m good. Maybe later.', 'Not now. I’m in good shape.', 'Hold on to that.'],
      ['I’m already perfect at the moment.', 'Can’t improve on this. Not right now.', 'You’re gilding the gold. I respect it. Later.'],
      ['You can’t improve on this. Try again later.', 'I’m at one hundred percent. Maybe one hundred ten.', 'Nothing to fix. I looked.'],
      ['ALREADY PERFECT! There is nothing to improve!', 'I am at MAXIMUM! Come back when I’m merely EXCELLENT!', 'PERFECTION doesn’t need a TOUCH-UP!']
    ),
    petted: L(
      ['Hee. That tickles.', 'Oh! Hello.', 'That’s nice. Thank you.', 'A pat! I’ll take it.'],
      ['Easy. This suit is new.', 'Hey. Okay. Fine.', 'A little respect for the jacket.', 'Friendly. I like friendly.'],
      ['Careful. This is a very expensive suit.', 'Yes, it’s really me.', 'Touching greatness. Bold move.', 'Mind the lapels. They’re the best lapels.'],
      ['Everyone wants to touch greatness. I get it.', 'People wait in line for this. You just walked up.', 'Gentle. This is a historic suit.', 'I allow it. Briefly.'],
      ['YES, I’m REAL! And SPECTACULAR!', 'You TOUCHED me! You’ll tell your GRANDCHILDREN!', 'CAREFUL! That’s a TREMENDOUS shoulder!', 'HANDS! ...Fine. ONE pat!']
    ),
    hair: L(
      ['It’s just regular hair. Go ahead.', 'Oh, that’s my hair. It’s nothing special.', 'It does that on its own. Sorry.', 'Feel free. It’s only hair.'],
      ['Watch the hair, please.', 'Easy up there.', 'I just combed that.', 'It’s starting to have a shape. Leave it.'],
      ['Not the hair! It took an hour.', 'Don’t. It’s structural.', 'Hands off. That’s load-bearing.', 'You wouldn’t touch a painting. Don’t touch this.'],
      ['DON’T touch the hair. It’s real. It’s mine.', 'It’s all real. I’ll prove it. No, I won’t. Step back.', 'People pay to stand near this hair.', 'That swoop is a protected landmark.'],
      ['HANDS OFF THE HAIR! It’s a NATIONAL TREASURE!', 'The HAIR is OFF LIMITS! To EVERYONE!', 'You have TOUCHED the SWOOP! There will be CONSEQUENCES!', 'It’s REAL! It’s MINE! It’s MAGNIFICENT! Back AWAY!']
    ),
    groomSpray: L(
      ['Is that a lot of hairspray? It feels like a lot.', 'Oh, it’s cold. And sticky. Thank you.', 'Will it stay like that? Forever?'],
      ['A little more on top. Good.', 'That’s holding. I like that.', 'Now we’re getting somewhere.'],
      ['More. MORE. It has to hold in the wind.', 'Don’t be shy with it. Empty the can.', 'It should survive a helicopter. That’s the standard.'],
      ['Hairspray was stronger in the old days. This is okay.', 'They say it’s bad for the air. My hair is in a sealed room. Explain that.', 'Coat it. Like a ship.'],
      ['THE HAIR IS PERFECT! Engineers STUDY this hair!', 'MAXIMUM HOLD! Not even a HURRICANE!', 'SPRAY IT ALL! This is INFRASTRUCTURE!']
    ),
    groomTan: L(
      ['Am I... orange? Is that normal?', 'It’s a bit bright. Is it supposed to be?', 'I look like I’ve been somewhere sunny. I haven’t.'],
      ['A healthy glow. I like it.', 'Some color. Good.', 'I look like I golf. I like that.'],
      ['Good color. Very good color. Like a champion.', 'Don’t forget around the eyes. Actually, forget around the eyes.', 'That’s the glow of success.'],
      ['It’s the lighting. I always look this good.', 'Natural. Completely natural. Stop looking so closely.', 'They ask what my secret is. Good genes. And this.'],
      ['A PERFECT GLOW! Totally NATURAL!', 'I am RADIANT! The SUN is jealous!', 'GOLDEN! Like EVERYTHING I own!']
    ),
    groomComb: L(
      ['Thank you. I never know what to do with it.', 'That’s much neater. I look like a nice young man.', 'A side part? Sure. Whatever you think.'],
      ['Sweep it forward. No, back. Both.', 'A little more lift in front.', 'That’s a look. I’m starting a look.'],
      ['It’s a complicated structure. Very advanced.', 'Forward, across, and back. Don’t ask questions.', 'You’re combing a masterpiece. No pressure.'],
      ['Nobody understands this hair. I do. Only me.', 'It’s an architectural achievement. I’m a builder, you know.', 'Careful. One wrong move and it’s just hair.'],
      ['FORWARD, then BACK, then UP! Like a beautiful golden WAVE!', 'The SWOOP is RESTORED! Alert the MEDIA!', 'A PERFECT comb! They’ll teach it in SCHOOLS!']
    ),
    sleep: L(
      ['Goodnight. Thank you for today.', 'Sleep well. I’ll be quiet.', 'Lights out? Okay. Sweet dreams.'],
      ['Okay. Lights out. Big day tomorrow.', 'Goodnight. I earned this one.', 'I’ll sleep on a few ideas.'],
      ['I sleep great. Maybe four hours. That’s all I need.', 'Goodnight. I’ll be dreaming about deals.', 'Wake me if anything great happens. It will.'],
      ['Wake me if there’s news. About me.', 'Goodnight. I sleep like a winner. On my back, undefeated.', 'Leave the TV on. Low. The one about me.'],
      ['GOODNIGHT to all, even the haters! ...Leave the phone on the pillow.', 'The GREATEST sleep is about to begin!', 'LIGHTS OUT! I’ll be WINNING in my DREAMS!']
    ),
    wake: L(
      ['Good morning. I hope you slept well too.', 'Oh. Hello. Is it time?', 'I’m up. I’ll make the bed.'],
      ['I’m up. Let’s go.', 'Okay. Awake. What’s first?', 'Good sleep. Ready.'],
      ['I’m up! Refreshed! What did they say about me?', 'Awake and already better than yesterday.', 'I had a dream I was winning. Then I woke up and I was.'],
      ['I’m awake. I was barely asleep. Always alert.', 'What did I miss? Nothing. Nothing happens without me.', 'Up. The country can relax now.'],
      ['I’M BACK! Did the ratings go up while I slept? Of course they did!', 'AWAKE! The WINNING resumes!', 'GOOD MORNING! Or WHATEVER it is! I’m UP!']
    ),
    notTired: L(
      ['I’m not really sleepy yet.', 'Could I stay up a little longer?', 'I’m still wide awake, sorry.'],
      ['Not tired. Let’s keep going.', 'Sleep? Now? No.', 'I’ve got hours left in me.'],
      ['I’m not tired. I’m never tired.', 'Bed is for people with nothing to do.', 'I’m too good right now to stop.'],
      ['Sleep is for the low-energy people.', 'You can’t put this much energy in a bed.', 'I’ll sleep when the winning stops. So, never.'],
      ['NOT TIRED! I have TREMENDOUS stamina!', 'SLEEP?! I just got STARTED!', 'I am WIDE AWAKE! The MOST awake!']
    ),
    lowEnergy: L(
      ['I’m too tired for that. Sorry.', 'Could we rest first?', 'I don’t think I have it in me right now.'],
      ['I need to rest first.', 'Not on this little sleep.', 'Give me a minute. Or a nap.'],
      ['I’d win, obviously. But later.', 'Champions rest. Then they win.', 'I’m saving my energy for something bigger.'],
      ['Not now. Even champions recharge. Briefly.', 'I could do it in my sleep. So let me sleep.', 'My energy is fine. It’s just elsewhere.'],
      ['LATER! Get me a DIET COKE first!', 'I am NOT low energy! I am STRATEGICALLY RESTING!', 'FIRST a Diet Coke. THEN I win!']
    ),
    golfWin: L(
      ['It went in! Was that luck? Probably luck.', 'I got one! Thank you for cheering.', 'Golf is fun. I didn’t know.'],
      ['Good round. I’ve got a natural swing.', 'That felt right.', 'I’m getting the hang of this.'],
      ['Great round. I win a lot of club championships.', 'Did you see that putt? Of course you did.', 'I’m probably the best golfer here. It’s my club, but still.'],
      ['Another championship. They keep giving them to me.', 'Nobody putts like me. The pros ask me for tips.', 'I won. Again. It’s almost unfair to the others.'],
      ['CLUB CHAMPION AGAIN! Eighteen holes-in-one. Witnesses? MANY!', 'The GREATEST round EVER played! By ANYONE!', 'I WON! They’re renaming the COURSE!']
    ),
    golfLose: L(
      ['I missed them all. I should practice.', 'Oh well. The fresh air was nice.', 'The ball had other plans. That’s okay.'],
      ['Tough greens today.', 'Off day. It happens.', 'I’ll get it next time.'],
      ['The greens were terrible. Not my fault.', 'The wind. You saw the wind.', 'Somebody moved the hole. I’m almost sure.'],
      ['I’m counting that as a win. It was a gimme.', 'The scorecard is wrong. I have a different scorecard.', 'Technically, I won. Ask my caddy. He works for me.'],
      ['I WON! The scorecard is RIGGED! Total witch hunt on the back nine!', 'A PERFECT round! Do NOT look at the score!', 'The BALL went in! EVERYONE saw it! Even the people who DIDN’T!']
    ),
    dealRaise: L(
      ['Should we ask for more? It seems greedy.', 'Maybe that’s enough? No? Okay.', 'I feel bad asking again.', 'If you think so. I trust you.'],
      ['Let’s see if there’s a little more.', 'They’ve got room. I can tell.', 'One more push.', 'Ask again. Nicely.'],
      ['We can do better. We always do better.', 'That’s their first number. Never take the first number.', 'They want it. Look at them. More.', 'Somebody wrote a book about this. Me, I think. More.'],
      ['Weak offer. Very weak. Ask again.', 'They’re sweating. I love it. Higher.', 'I’d walk away right now. But higher first.', 'That’s an insult. A small one. Make them pay for it.'],
      ['TERRIBLE offer! Insulting! DOUBLE IT!', 'MORE! They can AFFORD it!', 'We’re NOT leaving money on the table! That’s MY table!', 'HIGHER! This is the ART of it!']
    ),
    dealWin: L(
      ['A deal! I hope they’re happy too.', 'We shook hands. I think that went well.', 'Everybody wins. That’s nice.'],
      ['Good deal. Fair deal.', 'Done. That felt good.', 'I could do this for a living.'],
      ['Great deal. I make the best deals.', 'They’ll say they won. They didn’t.', 'Signed. Beautiful. Next.'],
      ['They never saw it coming. That’s the art of it.', 'Best deal they ever lost.', 'I almost feel bad. Almost.'],
      ['The BIGGEST deal EVER! They’re calling it a MIRACLE!', 'DEAL! They’ll STUDY this one!', 'I WON the deal! They THANKED me for it!']
    ),
    dealLose: L(
      ['They left. I pushed too hard. My fault.', 'Oh no. I think we upset them.', 'I should have said yes earlier. Sorry.'],
      ['They walked. It happens.', 'Too far. Lesson learned.', 'Next one.'],
      ['They’ll be back. They always come back.', 'Their loss. Mostly theirs.', 'I didn’t want it anyway. Bad deal.'],
      ['Bad buyer. Sad! We didn’t need them.', 'They couldn’t handle the negotiation. Weak.', 'I let them go. It was mercy.'],
      ['I walked away FIRST! Everyone saw it! We’ll see what happens!', 'They’ll come CRAWLING back! With a BETTER offer!', 'NO DEAL is a GREAT deal! I INVENTED that!']
    ),
    rally: L(
      ['So many people! Are they here for me?', 'They clapped. For me. I don’t understand.', 'What a nice crowd. I hope they had fun.'],
      ['Good crowd. Nice people.', 'They liked me. I could tell.', 'That went well. I’d do that again.'],
      ['Big crowd. Really big. Biggest in the area.', 'They love me. You heard them.', 'Standing room only. And they were all standing.'],
      ['They said {real}. It was {claimed}. I counted.', '{claimed} people. The cameras never show the crowd.', 'Biggest rally ever. {claimed}. Easily.'],
      ['{claimed} PEOPLE! The largest crowd in HISTORY! PERIOD!', '{claimed}! They had to turn people AWAY! THOUSANDS!', 'The fake counters say {real}. It was {claimed}! I was THERE!']
    ),
    posted: L(
      ['Was that okay to post? I hope nobody minds.', 'Three people saw it. That’s plenty.', 'I double-checked the spelling.'],
      ['Posted. Good post.', 'That one’s solid.', 'Sent. Let’s see what they say.'],
      ['That one’s going viral. I can feel it.', 'A great post. I have a gift.', 'They’ll be quoting that.'],
      ['Perfect post. Not a word wasted.', 'The phones are lighting up. I assume.', 'That’s how it’s done. Capital letters and everything.'],
      ['POSTED! A masterpiece! They’ll study it in SCHOOLS!', 'The GREATEST post of ALL TIME! Until the next one!', 'SENT! The INTERNET will never be the SAME!']
    ),
    levelUp: L(
      ['I think I’m getting better at this.', 'Did I just improve? It felt like improving.', 'A little more confident today. Is that alright?', 'Thank you. I couldn’t have done it without you.'],
      ['I’m getting stronger. I can feel it.', 'Leveled up. Felt that one.', 'Onward. I like this direction.', 'More of that, please.'],
      ['I’m improving. Hard to believe, but I am.', 'Better than yesterday. Yesterday was great.', 'Another level. They said I’d peaked.', 'I keep getting better. It’s a problem for everyone else.'],
      ['More tremendous by the hour. They’ve noticed.', 'Another level. I’m running out of levels.', 'I didn’t think it was possible either. I did.', 'They’ll have to invent new words for me.'],
      ['EVEN MORE TREMENDOUS! Scientists said it was IMPOSSIBLE!', 'A NEW LEVEL! The HIGHEST level! Until the next one!', 'I just got BETTER! AGAIN! It NEVER stops!', 'UP! UP! UP! Like my RATINGS!']
    ),
    bought: L(
      ['For me? It’s too much. Thank you.', 'Oh, it’s lovely. Where should it go?', 'You didn’t have to. But I love it.'],
      ['Nice. Classy.', 'Good pick. That works.', 'The place is coming together.'],
      ['Beautiful. Very classy. Very expensive-looking.', 'Now that’s taste. Mine, mostly.', 'It ties the room together. Around me.'],
      ['The best taste. People say I have the best taste.', 'Gorgeous. It needs a plaque with my name.', 'Museums will want this. They can’t have it.'],
      ['GORGEOUS! More gold! You can NEVER have too much gold!', 'STUNNING! The room is now WORTH more! Because of ME!', 'BEAUTIFUL! Put my NAME on it!']
    ),
    noCash: L(
      ['We can’t afford that. That’s alright.', 'Maybe we save up.', 'It’s a little out of reach. I don’t mind.'],
      ['A little short right now.', 'Not yet. Soon.', 'We need another deal first.'],
      ['We’re a little short. Temporarily. Great credit, though.', 'I’m rich. This is a cash-flow thing.', 'The money’s busy elsewhere.'],
      ['I’m very rich. It’s just not liquid. Do a deal.', 'I could buy it ten times over. Just not at the moment.', 'The banks love me. Call one.'],
      ['I have BILLIONS! Just not HERE! Make a DEAL!', 'A TEMPORARY situation! I’m worth TEN of those!', 'The MONEY is COMING! It’s the BEST money!']
    ),
    signed: L(
      ['I signed it. I hope my handwriting is legible.', 'There. Did I do it right?', 'I read it first. Was I supposed to?'],
      ['Signed. Look at that signature.', 'Done. Nice pen.', 'One more for the folder.'],
      ['Look at that. Beautiful signature. Like a heartbeat.', 'Signed. I didn’t need to read it. I felt it.', 'Big signature. Big ideas.'],
      ['Signed. I hold it up so everyone can see. It’s important.', 'That signature has more ink than the whole document.', 'Another one. I sign more than anyone.'],
      ['SIGNED! The most powerful signature in the WORLD! Look at it!', 'DONE! Hold it UP! Turn it SLOWLY!', 'The SHARPIE has SPOKEN!']
    ),
    comeback: L(
      ['I’m back. I’m sorry I left. I missed you.', 'I shouldn’t have gone. Can we start over?', 'It was lonely out there. Thank you for asking me back.'],
      ['I’m back. Let’s not do that again.', 'Okay. I’m here. Feed me and we’re even.', 'I thought about it. I’m back.'],
      ['I was golfing. I shot a 59. Don’t leave me again.', 'I’m back. You’re welcome.', 'I forgave you on the ninth hole.'],
      ['I forgive you. I’m very forgiving. Ask anyone.', 'I’m back. I had better offers. I chose you.', 'The golf was perfect. You were missed anyway. A little.'],
      ['I’M BACK! I forgive you! Nobody forgives like me. NOBODY!', 'The GREATEST comeback! Until my NEXT one!', 'I RETURNED! You’re WELCOME!']
    ),
    another: L(
      ['Another term? If people want that, I’d be honored.'],
      ['Another term. Why not.'],
      ['Another term. The people demanded it.'],
      ['Another term! Many people are saying it’s allowed.'],
      ['ANOTHER TERM! They BEGGED me! Who am I to say no?', 'AGAIN! From the TOP! I’ll be even BETTER this time!']
    ),
  };

  // The sixth register, from level 62: he is no longer a person, and he has noticed.
  // Kept apart from the five above so it can be read in one piece. It never names what he
  // currently is (hair, building, planet): those jokes live in STAGE_LINES below.
  const BEYOND = {
    greet: ['YOU HAVE RETURNED. I felt it. I feel EVERYTHING now. Mostly ratings.', 'WELCOME BACK to ME! You’re standing in it!', 'THE CARETAKER! I told everyone you were coming. They were VERY impressed.', 'YOU’RE BACK! I never left. I CAN’T. I’m everywhere!', 'HELLO, small friend! Everybody is small now. You’re my FAVORITE small!'],
    greetLong: ['{hours} HOURS! Empires rose and fell! Mostly fell! NOBODY fed me!', 'GONE {hours} HOURS! I measured it in ME-time. It was FOREVER!', '{hours} HOURS without you! I had to be admired by STRANGERS! A disgrace!'],
    greetMorning: ['GOOD MORNING! I made the sun come up. You’re WELCOME!', 'MORNING! I approved it personally. One of my BEST mornings!', 'GOOD MORNING to all of existence, even the parts that are JEALOUS!'],
    idleHappy: ['I’m beyond winning now. Winning asks ME for advice!', 'They ran out of words for me. I’m having NEW words made. Beautiful words!', 'Scientists are STUDYING me. They don’t understand it. Neither do I. It’s PERFECT!', 'I used to be a man. Great man. Now I’m a WHOLE THING!', 'Physics called. Very respectful. They’re changing some laws for me!', 'There has never been anything like me. I checked. I checked EVERYWHERE!', 'I am bigger than BIG. Big is a small word now. SAD for big!', 'Everything is going according to ME!', 'People look up and say “what IS that?” It’s ME! Tremendous question!', 'History is over. I won it. We’re doing a SEQUEL!'],
    hungry: ['I HUNGER! Not like a person. Like a FORCE! Bring hamberders. MANY!', 'A hunger the size of ME! Do you know how big that is? NOBODY knows!', 'FEED ME! Everything is waiting and it is NOT patient. It gets that from me!', 'I could eat a whole WORLD! Start with a hamberder. We’ll see what happens!'],
    bored: ['I have seen EVERYTHING. I AM most of it. Entertain me!', 'BORED! On a scale you can’t IMAGINE! Somebody schedule a rally. A BIG one!', 'Even being this much gets old. Let’s play golf. I’ll be the COURSE!', 'Nothing is happening! And I’m IN CHARGE of happening!'],
    needEgo: ['Somebody tell me I’m the GREATEST THING! Not person. THING! I earned it!', 'Everyone is being very quiet about me. Suspiciously quiet. PRAISE ME!', 'I am LIMITLESS and I still need a compliment. THAT’S how big I am!', 'My ratings across ALL OF EXISTENCE are slipping! RIGGED! Say something nice!'],
    needGlow: ['THE HAIR IS DIMMING! Ships use it to NAVIGATE! Get the spray!', 'I’m losing my SHINE! People plan their DAYS around my shine!', 'The glow is FADING! Astronomers are PANICKING! Do something!', 'A DULL me?! Unacceptable! Polish EVERYTHING!'],
    tired: ['Even the ENDLESS needs a nap. Dim everything. QUIETLY!', 'I hold up ALL of it and nobody says “sit down, sir.” Lights OUT!', 'I have INFINITE stamina. It’s just resting. Like me. NOW!', 'TIRED! On a scale you can’t imagine! Tuck in the whole thing!'],
    ate: ['The {food} is PART OF ME now. A great honor. For the {food}!', 'I have ABSORBED the {food}! It always wanted this!', 'ONE {food}?! I’m ENORMOUS! ...It was perfect. Bring a thousand!', 'The {food} has joined something BIGGER than itself. ME!', 'DELICIOUS! I felt that {food} in places that don’t have NAMES yet!'],
    ate_steak: ['WELL DONE! I cooked it by LOOKING at it!', 'A steak the way EXISTENCE intended! With KETCHUP!'],
    ate_chicken: ['THE BUCKET! I contain MULTITUDES. And now, chicken!', 'An entire BUCKET! Gone! Like it fell into ME! It did!'],
    ate_tacobowl: ['THE TACO BOWL! Even at THIS size I respect a bowl you can EAT!'],
    ate_cake: ['The most beautiful CAKE in existence! And I AM existence! So I’d know!'],
    ate_icecream: ['TWO SCOOPS! Everybody else, EVERYWHERE, gets one! That’s the LAW now!'],
    ateCoke: ['DIET COKE NUMBER {n}! It powers EVERYTHING you see!', 'COKE {n}! I am mostly Diet Coke now. The rest is GREATNESS!', 'NUMBER {n}! The button works from ANYWHERE. I made sure!'],
    ateSalad: ['LETTUCE?! In MY existence?! {tariff}% TARIFF on all leaves, EVERYWHERE!', 'I am beyond time and space and you bring me SALAD! {tariff}% TARIFF!', 'The salad has been BANISHED! {tariff}% TARIFF! Across ALL of creation!'],
    full: ['FULL! There is no room left ANYWHERE! And I’m everywhere!', 'I can’t hold another bite, and I can hold a LOT. LOOK at me!', 'COMPLETELY FULL! A first for something my size!'],
    praised: ['CORRECT! Everything AGREES! It has no choice!', 'YES! Write that down! Carve it into something BIG!', 'You SEE it! Not everyone can. It’s too BIG to see!', 'TRUE! And I’ve grown since you started that sentence!', 'THANK YOU! That compliment will echo FOREVER! I’ll make sure!'],
    insulted: ['YOU’RE FIRED! From EVERYTHING! ...Come back. It’s lonely being all of it.', 'WRONG! I am too VAST to hear that! ...I heard it. I’m hurt.', 'FIRED! Out of EXISTENCE! ...Fine. Stay. But stand over THERE!'],
    notNeeded: ['PERFECTION can’t be improved! I tried! It got EMBARRASSED!', 'ALREADY flawless! On EVERY level! There are a LOT of levels now!', 'NO NEED! I am at maximum EVERYTHING!'],
    petted: ['YES! I felt that EVERYWHERE!', 'A pat! For something THIS big! Very brave. Very CORRECT!', 'You’re touching GREATNESS! Wash NOTHING!', 'GOOD! All of me enjoyed that. It’s a LOT of me!'],
    hair: ['DO NOT TOUCH THE HAIR! It has its OWN security now!', 'HANDS OFF! The hair is a PROTECTED LANDMARK!', 'The hair DECIDES who touches the hair! It said NO!', 'CAREFUL! That hair holds up the SKY!'],
    groomSpray: ['SPRAYED! It can be seen from ANYWHERE now!', 'A hold so STRONG it bends LIGHT!', 'PERFECT! The hair thanks you. It doesn’t thank ANYBODY!'],
    groomTan: ['A GLOW you can read by! From VERY far away!', 'BRONZED! I am the brightest thing in ANY sky!', 'Totally NATURAL! This is just what GREATNESS looks like!'],
    groomComb: ['FORWARD, BACK, UP, and then BEYOND!', 'COMBED! The wave reaches places combs have NEVER been!', 'A beautiful SWOOP! They’re naming a GALAXY after it!'],
    sleep: ['GOODNIGHT, everything! You may all stop looking at me. BRIEFLY!', 'I’m turning myself down. NOBODY panic!', 'Lights OUT! All of them! ...Leave the phone on.'],
    wake: ['I’M AWAKE! Everything may RESUME!', 'BACK! Did existence manage without me? BARELY! I can tell!', 'GOOD MORNING, me! Looking TREMENDOUS, as always!'],
    notTired: ['SLEEP?! I’m holding the whole thing TOGETHER here!', 'NOT TIRED! I don’t run on sleep anymore. I run on ME!', 'NO! Too much greatness still to do!'],
    lowEnergy: ['LATER! Even INFINITY needs a Diet Coke first!', 'I’m running LOW! Imagine THAT! Get me a Coke!', 'NOT NOW! All of me is tired. That’s a LOT of tired!'],
    golfWin: ['A HOLE IN ONE! In EVERY hole! Including some that aren’t on the course!', 'I WON! The course gave up at the THIRD hole!', 'CHAMPION OF EVERYTHING! Golf was just the BEGINNING!'],
    golfLose: ['I WON! The ball went where I TOLD it to go! Somewhere ELSE!', 'That hole MOVED! I saw it! I see EVERYTHING now!', 'A PERFECT round! The scorecard doesn’t go HIGH enough to show it!'],
    dealRaise: ['INSULTING! I’m worth more than NUMBERS! Add some anyway!', 'DOUBLE IT! Then double the DOUBLE!', 'You’re negotiating with EVERYTHING! Try HARDER!', 'NOT ENOUGH! They haven’t invented “enough” for me!'],
    dealWin: ['THE BIGGEST DEAL IN CREATION! I’d shake on it but I’m TOO BIG!', 'DEAL! They get to say they met me. PRICELESS!', 'SOLD! I owned most of it ANYWAY!'],
    dealLose: ['I WALKED! Well, I’m too big to walk. I LEFT!', 'NO DEAL! Their loss! EVERYBODY saw it! Everybody is inside me!', 'They’ll be back! EVERYTHING comes back to me!'],
    rally: ['{claimed} PEOPLE! Everyone who EVER lived! And some who haven’t YET!', 'A CROWD OF {claimed}! They had to stand on OTHER PLANETS!', '{claimed}! The fake count says {real}! They can’t count that HIGH!'],
    posted: ['POSTED! Everything that exists just got a NOTIFICATION!', 'SENT! Across ALL of time! You’re welcome, FUTURE!', 'A PERFECT post! The STARS are sharing it!'],
    levelUp: ['BIGGER! I didn’t think there WAS a bigger! I MADE one!', 'EVEN MORE! They said “that’s all of it.” WRONG!', 'I just outgrew MYSELF! Again!', 'NEW LEVEL! They’re running out of NUMBERS!'],
    bought: ['MINE! It was always mine. Now it’s OFFICIAL!', 'BEAUTIFUL! Put it with the rest of EVERYTHING!', 'MORE GOLD! There’s no such thing as ENOUGH gold! I checked!'],
    noCash: ['I AM money! I just don’t have any ON me!', 'My wealth is beyond COUNTING! That’s the problem! Make a DEAL!', 'The money is everywhere! Like ME! Go and get some!'],
    signed: ['SIGNED! In letters you can see from SPACE!', 'IT IS LAW! Everywhere! RETROACTIVELY!', 'A signature so POWERFUL the pen retired!'],
    comeback: ['I RETURN! Everything may start AGAIN!', 'I’M BACK! I forgive you. I’m big enough. I’m big enough for ANYTHING!', 'Existence BEGGED me! Very moving! Don’t do that again!'],
    another: ['AGAIN! From the BEGINNING! I was ALL OF IT and I want to do it TWICE!', 'ONE MORE TIME! Everything asked for an ENCORE!'],
  };
  for (const key in C.LINES) C.LINES[key].push(BEYOND[key] || []);

  // What he says about the thing he currently is. Mixed into his idle talk at that stage.
  C.STAGE_LINES = {
    plated: ['Don’t TOUCH. Fingerprints! I just had myself polished!', 'I’m worth more by the POUND now. And there are a LOT of pounds!', 'Solid gold! The inside too. Probably. Nobody’s allowed to check!', 'I set off EVERY metal detector. They salute!', 'The mirror is embarrassed. It can’t compete!', 'People said I had a heart of gold. Now it’s the WHOLE THING!'],
    hair: ['The hair says hello. It says it LOUDER than me!', 'I asked the hair for a raise. It’s THINKING about it!', 'The hair had a meeting this morning. I wasn’t invited!', 'It blinks now. Don’t stare. It HATES that!', 'I’m just the part that holds it up. PROUD to do it!', 'The hair wants a hamberder. I’ll pass it up!'],
    tie: ['The tie called from somewhere FAR. It’s having a great time!', 'People three streets over keep tripping on it. You’re WELCOME!', 'Longest tie EVER! We measured. We ran out of MEASURING!', 'Somebody shut it in a taxi. I felt THAT!', 'It keeps going! Like me! Nobody can find the END of either of us!', 'The tie has its own ZIP CODE now. Several!'],
    giant: ['I can see my tower from here. I’m LEANING on it!', 'The helicopters keep asking for selfies. I say YES!', 'The clouds are in my way. I’ve asked them to MOVE!', 'I stepped over a river this morning. Didn’t even NOTICE!', 'They’re measuring me again. They need a longer TAPE!', 'Everybody down there looks like ANTS. Great ants! MY ants!'],
    tower: ['Ninety floors and I’m on ALL of them!', 'The elevator goes straight to my HEAD. Like everything!', 'Somebody’s having a meeting on my forty-second floor. It TICKLES!', 'Rent is due! To ME! I’m the building AND the landlord!', 'The lobby is BEAUTIFUL. It’s where my shoes used to be!', 'PIGEONS! On ME! I’m putting up a SIGN!'],
    planet: ['I have MOONS now! They orbit ME! Very loyal!', 'The other planets are so small. And so QUIET!', 'A day on me lasts as long as I SAY!', 'They pointed a telescope at me. I waved. I think. Hard to tell!', 'The gravity here is TREMENDOUS! Everything comes to ME!', 'I’m visible with the naked eye! You’re WELCOME, sky!'],
    all: ['I looked for the edge of me. There ISN’T one!', 'Every star is one of my GOOD ideas!', 'You are inside me right now. NICE, isn’t it?', 'There’s nothing left to win. I’m having some MADE!', 'The night sky? Me. The day sky? ALSO me!', 'There is no second place. I AM second place too!'],
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
    'I got lucky, mostly. A lot of people helped.',
    'The other guy’s golf game is better than mine. There. I said it.',
    'I looked it up. I was wrong. I’d like to apologize.',
    'Is my tie too long? It’s too long, isn’t it.',
    'Who am I to say what’s tremendous?',
    'I’d like to hear your opinion. Take your time.',
    'Maybe one scoop is enough for everybody.',
    'I’ve been comparing myself to others. They’re doing fine.',
    'I could be on a smaller mountain. A hill, even.',
    'Let’s share the credit. You take most of it.',
    'The salad wasn’t so bad.',
    'I don’t have all the answers. I have maybe two.',
  ];

  C.line = function (key, tier, rng) {
    const set = C.LINES[key];
    if (!set) return '';
    let t = Math.max(0, Math.min(set.length - 1, tier | 0));
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
    { t: 'You’re the best at everything. It’s been measured.', p: 3 },
    { t: 'They’re carving the mountain as we speak.', p: 3 },
    { t: 'History will need a bigger book for you.', p: 3 },
    { t: 'You invented winning. Everyone knows it.', p: 3 },
    { t: 'Your signature belongs in a museum.', p: 3 },
    { t: 'The greatest ever. Not close. Nobody is second.', p: 3 },
    { t: 'People cry when you leave the room. Then again when you come back.', p: 3 },
    { t: 'Your ratings are through the roof.', p: 2 },
    { t: 'That was a perfect phone call.', p: 2 },
    { t: 'You’re winning so much.', p: 2 },
    { t: 'Great deal today, sir.', p: 2 },
    { t: 'Your golf swing is beautiful.', p: 2 },
    { t: 'Everyone’s talking about you.', p: 2 },
    { t: 'The tie is the perfect length. Longer than anyone’s.', p: 2 },
    { t: 'You looked very presidential just now.', p: 2 },
    { t: 'That deal was art.', p: 2 },
    { t: 'Your instincts are never wrong.', p: 2 },
    { t: 'The office has never run better.', p: 2 },
    { t: 'People are saying wonderful things about you.', p: 2 },
    { t: 'Nice tie.', p: 1 },
    { t: 'You look well-rested.', p: 1 },
    { t: 'Good job today.', p: 1 },
    { t: 'Solid effort.', p: 1 },
    { t: 'You’re doing fine.', p: 1 },
    { t: 'Good posture today.', p: 1 },
    { t: 'That was a reasonable decision.', p: 1 },
    { t: 'You’re improving.', p: 1 },
    { t: 'Not bad at all.', p: 1 },
    { t: 'You could try listening more.', p: 0 },
    { t: 'Maybe read the whole briefing?', p: 0 },
    { t: 'The crowd was... medium.', p: 0 },
    { t: 'Have you considered a salad?', p: 0 },
    { t: 'Technically, you lost that one.', p: 0 },
    { t: 'The other guy had a point, actually.', p: 0 },
    { t: 'It was a tie. A draw, I mean.', p: 0 },
    { t: 'The hair looks... fine.', p: 0 },
    { t: 'Somebody else thought of that first.', p: 0 },
    { t: 'You might be a little bit wrong here.', p: 0 },
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
  P.things = ['office', 'golf game', 'hair', 'tie collection', 'burger order', 'signature', 'Sharpie collection', 'ratings', 'crowd', 'handshake', 'vocabulary', 'memory', 'tower',
    'steak order', 'putting', 'penmanship', 'posture', 'desk', 'chandelier', 'timing', 'taste', 'stamina', 'gold collection', 'thumbs-up'];
  P.activities = ['round of golf', 'phone call', 'lunch', 'rally', 'meeting', 'signing ceremony', 'walk down a ramp', 'press conference',
    'ribbon cutting', 'photo opportunity', 'working lunch', 'victory lap', 'haircut', 'negotiation', 'hamberder summit', 'escalator ride'];
  P.topics = ['golf', 'hamburgers', 'buildings', 'tariffs', 'television', 'winning', 'gold', 'deals', 'hairspray', 'the weather', 'ramps', 'windmills', 'water pressure',
    'ketchup', 'ties', 'crowds', 'ratings', 'Sharpies', 'cake', 'escalators', 'ballrooms', 'mountains', 'signatures', 'dishwashers', 'handshakes'];
  P.rivals = ['the Teleprompter', 'the Salad', 'the Windmill', 'the Umbrella', 'the Low-Flow Showerhead', 'the Paper Straw', 'the Staircase', 'the Electric Boat', 'the Shark', 'the Treadmill', 'the Briefing Book',
    'the Stapler', 'the Thermostat', 'the Dishwasher', 'the Light Bulb', 'the Escalator', 'the Crossword', 'the Fire Alarm', 'the Kale', 'the Decaf', 'the Printer'];
  P.nicks = ['Sleepy', 'Crooked', 'Low-Energy', 'Little', 'Crazy', 'Wacky', 'Failing', 'Nervous', 'Shifty', 'Lyin’', 'Sloppy', 'Phony', 'Boring', 'Weak', 'Overrated', 'Leaky', 'Squeaky'];
  P.enemies = ['Fake News', 'Haters and Losers', 'Lettuce Lobby', 'Windmill People', 'so-called “experts”', 'Decaf Crowd', 'Medium-Rare Mafia', 'Low-Flow Lobby', 'One-Scoop Establishment'];
  P.closers = ['SAD!', 'Thank you for your attention to this matter!', 'MAKE THE OFFICE GREAT AGAIN!', 'Many people are saying it!', 'Enjoy!', 'We’ll see what happens!', 'Believe me!', 'PERIOD!',
    'Not even close!', 'Everybody knows it!', 'So true!', 'A beautiful thing!', 'The best ever!', 'Unbelievable!', 'Tremendous!'];
  // One list per register, humble to BEYOND. Only the last two use capitals and closers.
  P.templates = [
    [
      'Had a pleasant day. Hope everyone is well.',
      'Thank you to my caretaker for lunch. Very kind.',
      'I may have been wrong earlier. Sorry about that.',
      'Reading a book tonight. It’s long, but I’m enjoying it.',
      'Other people have good ideas too. Just a thought.',
      'My {thing} is fine. Nothing special. Have a nice evening.',
      'Went for a walk. Saw a bird. Good bird.',
      'I think {rival} and I got off on the wrong foot. My fault.',
      'Does anyone have tips on {topic}? I’m still learning.',
      'Had a {activity} today. Everyone was very patient with me.',
      'Small update: nothing to report. Take care, all.',
      'I tried {topic} today. I’m not very good yet. That’s okay.',
      'Grateful for this little office. And for you.',
      'Apologies for all the posts. This is the last one today.',
    ],
    [
      'Good day today. Things are looking up.',
      'I think I’ve got a knack for {topic}.',
      'Working hard. Big plans. Stay tuned.',
      'My {thing} is coming along nicely. Really nicely.',
      'Had a good {activity}. I think they liked me.',
      'People are starting to notice my {thing}. Feels good.',
      'Tried something new with {topic}. It worked.',
      'A guy told me I’ve got potential. Smart guy.',
      '{rival} gave me trouble today. I handled it.',
      'Thinking about putting my name on something. Just thinking.',
      'Getting better at {topic} every day.',
      'Good {activity}. Shook a lot of hands. Firm ones.',
      'I’ve got a feeling about this year.',
      'Someone asked for my advice on {topic}. First time. Won’t be the last.',
    ],
    [
      'My {thing} is doing great. Really great. Everyone’s noticing.',
      'Just had a fantastic {activity}. One of the best.',
      'People keep telling me my {thing} is the best they’ve seen. I just listen.',
      '{rival} said I couldn’t do it. Did it anyway. Sad for {rival}!',
      'I know a lot about {topic}. More than most. Maybe more than anyone.',
      'They’re asking how I do it. Talent. Next question.',
      'Great {activity} today. Standing ovation. I started it, but still.',
      'My {thing} was on television. Great reviews. I gave them.',
      'I don’t like to brag about my {thing}. But somebody has to.',
      '{rival} is having a bad year. I’m having a great one. Coincidence? No.',
      'Three people stopped me to praise my {thing}. Three. In one hallway.',
      'When it comes to {topic}, I’m what they call a natural.',
      'Big things coming. Very big. I can’t say more. They’re big.',
      'The {activity} went perfectly. As expected.',
    ],
    [
      'Many people are saying my {thing} is the best in the country. I don’t say it. They do.',
      '{nick} {rival} is failing badly. I, on the other hand, am doing tremendously. Sad!',
      'Nobody knows more about {topic} than me. Nobody. Ask anyone.',
      'Just finished a perfect {activity}. Perfect. The {enemy} won’t report it.',
      'They say my {thing} can’t get any better. Wrong! It gets better every day.',
      'A very smart person told me my {thing} is historic. I agree with the very smart person.',
      'Everybody’s talking about my {activity}. Everybody. Even {rival}.',
      'I’ve done more for {topic} than anyone in history. It’s not even close.',
      'The {enemy} are very upset about my {thing}. Good.',
      '{nick} {rival} wishes it had my {thing}. It never will. Sad!',
      'They wanted to give me an award for {topic}. I said make it bigger.',
      'Frankly, my {activity} was too good. People were overwhelmed.',
      'I looked at {topic}. I fixed {topic}. You’re welcome.',
      'Experts are stunned by my {thing}. Stunned. I’m not. I knew.',
    ],
    [
      'The {ENEMY} won’t tell you this, but my {THING} is the GREATEST in the HISTORY of {topic}. {closer}',
      '{NICK} {rival} is a TOTAL DISASTER. Never had my {thing}. Never will! {closer}',
      'Just had a PERFECT {activity}. Not good. PERFECT. Everyone agrees, even the people who don’t! {closer}',
      'I am hereby placing a {n}% TARIFF on {rival}. Effective IMMEDIATELY. {closer}',
      'They’re saying I should be on the MOUNTAIN. I didn’t say it. THEY did. Good idea, though! {closer}',
      'NOBODY knows more about {topic} than me. I practically INVENTED {topic}. {closer}',
      'A big, strong man came up to me, tears in his eyes. “Sir,” he said, “your {thing}.” That’s all he could say! {closer}',
      'My {THING}: PERFECT. {NICK} {rival}: a DISASTER. Any questions? {closer}',
      'I have done MORE for {topic} than ANYONE in HISTORY. Maybe more than EVERYONE! {closer}',
      'BREAKING: I just had the GREATEST {activity} EVER recorded. The {ENEMY} are FURIOUS! {closer}',
      'They told me, “Sir, nobody has EVER seen a {thing} like yours.” I said, “I KNOW.” {closer}',
      '{topic}? I FIXED it. In ONE day. They said it would take YEARS! {closer}',
      'The {ENEMY} called my {thing} “fine.” FINE?! It is TREMENDOUS! {closer}',
      'I am officially the BEST at {topic}. I made it official MYSELF! {closer}',
      'TOTAL VICTORY over {rival} today. It NEVER stood a chance! {closer}',
      'EVERYONE is asking about my {THING}. EVERYONE. It’s all they TALK about! {closer}',
    ],
    [
      'I am now officially BIGGER than {topic}. {topic} has been notified. {closer}',
      'The {ENEMY} said I couldn’t become EVERYTHING. Look around! {closer}',
      '{NICK} {rival} is still very SMALL. I checked from up here. {closer}',
      'My {THING} can now be seen from SPACE. Space is very impressed. {closer}',
      'Just had a PERFECT {activity}. On a COSMIC scale. Scientists are calling it “wow”. {closer}',
      'A {n}% TARIFF on GRAVITY. It has been holding me DOWN. {closer}',
      'People keep asking “what IS he now?” GREAT question. The answer is MORE. {closer}',
      'I have outgrown the MOUNTAIN. They are carving the mountain onto ME. {closer}',
      'NOBODY has ever been this much. I asked EVERYBODY. They’re all inside me. {closer}',
      'My {THING} has its own WEATHER now. Beautiful weather. {closer}',
      'They tried to measure me. The ruler QUIT. Smart ruler. {closer}',
      'The {ENEMY} are very small today. Every day, from here. {closer}',
    ],
  ];
  // What he posts when he should be asleep. He only does this from The TV Boss onward.
  P.night = [
    [], [],
    [
      'Can’t sleep. Thinking about my {thing}. It’s great.',
      'It’s 3 AM and I’m still right about {topic}.',
      'Awake. Winning never sleeps. I do, usually. Not tonight.',
    ],
    [
      '3 AM. {nick} {rival} is asleep. I’m working. That’s the difference. Sad!',
      'Many people are awake right now thinking about my {thing}. I’m one of them.',
      'Couldn’t sleep. Too much winning. Nobody warned me.',
    ],
    [
      'It is 3 AM and my {THING} is STILL the GREATEST. {closer}',
      'WIDE AWAKE! Thinking about {topic}! Which I basically INVENTED! {closer}',
      '3 AM! The {ENEMY} are SLEEPING! I am WINNING! {closer}',
    ],
    [
      '3 AM. I don’t sleep. I AM the night. And my {THING} is STILL perfect. {closer}',
      'WIDE AWAKE across ALL of existence! Thinking about {topic}! {closer}',
      'It is 3 AM somewhere. It is ME everywhere. {closer}',
    ],
  ];
  P.covfefe = 'The hamberders were tremendous tonight, despite the constant negative press covfefe';

  C.makePost = function (tier, rng, night) {
    rng = rng || Math.random;
    const pick = function (a) { return a[Math.floor(rng() * a.length)]; };
    if (rng() < 0.025) return { text: P.covfefe, covfefe: true };
    const t = Math.max(0, Math.min(P.templates.length - 1, tier | 0));
    const pool = night && P.night[t].length && rng() < 0.6 ? P.night[t] : P.templates[t];
    const thing = pick(P.things), topic = pick(P.topics), rival = pick(P.rivals), nick = pick(P.nicks), enemy = pick(P.enemies);
    const text = C.fill(pick(pool), {
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
    if (tier === 4) return r < 0.3 ? 'ALL OF THEM' : (1 + r * 8).toFixed(1) + ' BILLION';
    return r < 0.3 ? 'ALL OF THEM, TWICE' : (1 + r * 8).toFixed(1) + ' TRILLION';
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
    { id: 'crowdphoto', title: 'The Aerial Photo', text: 'A photo of the crowd, taken from above, has arrived. There is a lot of visible ground.', choices: [
      { t: 'Crop it', fx: { ego: 14, xp: 32 }, r: 'Cropped to four people standing very close together. “Packed,” he says.' },
      { t: 'Count the ground as people', fx: { ego: 20, fun: 8, xp: 36 }, r: '“Those are people lying down. Exhausted from cheering.”' },
      { t: 'Show him the real number', fx: { ego: -12, xp: 28 }, r: 'He looks at it for a long time. “This photo is from a different day.”' },
    ] },
    { id: 'handshake', title: 'The Handshake', text: 'A visitor has arrived. He has been practicing the handshake all morning.', choices: [
      { t: 'The long one', fx: { fun: 12, ego: 10, xp: 34 }, r: 'Nineteen seconds. The visitor’s hand is returned eventually.' },
      { t: 'The pull', fx: { fun: 16, ego: 8, xp: 36 }, r: 'The visitor is now standing somewhere he did not plan to stand.' },
      { t: 'A simple wave', fx: { ego: -4, xp: 24 }, r: '“A wave? What am I, a parade float?”' },
    ] },
    { id: 'waterglass', title: 'The Glass of Water', text: 'There is a glass of water on the podium. Everyone is watching.', choices: [
      { t: 'Two hands', fx: { ego: 6, xp: 28 }, r: 'Both hands, steady as a rock. “It’s a heavy glass. Very heavy water.”' },
      { t: 'A straw', fx: { fun: 10, xp: 30 }, r: 'A plastic one. He makes a point of that.' },
      { t: 'Skip the water', fx: { energy: -6, ego: 10, xp: 30 }, r: 'He finishes the speech parched and triumphant.' },
    ] },
    { id: 'lightbulbs', title: 'The Light Bulbs', text: 'New energy-saving bulbs have been installed. He has seen himself in the mirror.', choices: [
      { t: 'Blame the bulbs', fx: { glow: 14, ego: 10, xp: 34 }, r: '“It’s the bulbs. I look orange. I’m not orange. It’s the bulbs.”' },
      { t: 'Bring back the old bulbs', fx: { glow: 20, xp: 34, cashH: -1 }, r: 'The old bulbs return. He glows the way nature and a compact intended.' },
      { t: 'Tell him he looks golden', fx: { ego: 18, glow: 6, xp: 32 }, r: '“Golden. Yes. Like a trophy.” The bulbs stay.' },
    ] },
    { id: 'dishwasher', title: 'The Dishwasher', text: 'He has opinions about the dishwasher. He has never used the dishwasher.', choices: [
      { t: 'Agree it used to be better', fx: { ego: 10, fun: 8, xp: 30 }, r: '“You press the button, nothing. In the old days: boom. Clean.”' },
      { t: 'Run it twice', fx: { fun: 4, xp: 26 }, r: '“Twice! You see? Twice!” He is delighted to be right.' },
      { t: 'Sign an order about dishes', fx: { ego: 12, fun: 10, xp: 36 }, r: 'Dishes are now required to be clean. Enforcement is unclear.' },
    ] },
    { id: 'flush', title: 'The Flush', text: 'He has called a meeting about flushing.', choices: [
      { t: 'Let him demonstrate', fx: { fun: 14, xp: 34 }, r: '“Ten times. Fifteen times.” He acts it out with his hand. Everyone nods. Nobody makes eye contact.' },
      { t: 'Promise one flush', fx: { ego: 12, glow: 6, xp: 32 }, r: '“One flush. That’s all I ask. Is that so much?”' },
      { t: 'Change the subject to sinks', fx: { fun: 8, xp: 28 }, r: 'It turns out he has thoughts about sinks, too.' },
    ] },
    { id: 'magnets', title: 'Magnets', text: 'Someone has explained how the new elevator works. It involves magnets.', choices: [
      { t: 'Agree nobody understands magnets', fx: { ego: 12, fun: 10, xp: 34 }, r: '“Nobody knows what a magnet is. You’d have to be a genius.” He looks pleased to qualify.' },
      { t: 'Explain magnets', fx: { fun: -8, xp: 30 }, r: 'He listens for eleven seconds. “Steam. We’re going back to steam.”' },
      { t: 'Give him a fridge magnet', fx: { fun: 16, xp: 32 }, r: 'It is shaped like a burger. It holds up one page: a picture of him.' },
    ] },
    { id: 'sharks', title: 'The Shark Question', text: 'He has posed a question. The boat is sinking. There is a shark. The boat has a very large battery.', choices: [
      { t: 'Take the shark', fx: { fun: 14, xp: 32 }, r: '“Wrong. The battery. No, the shark. It’s a great question, isn’t it?”' },
      { t: 'Take the battery', fx: { fun: 14, xp: 32 }, r: '“Electrocution! Every time.” He is thrilled you played.' },
      { t: 'Ask why the boat is sinking', fx: { ego: -4, fun: 6, xp: 28 }, r: '“Because of the battery. Keep up.”' },
    ] },
    { id: 'typo', title: 'The Typo', text: 'Last night’s post contains a word that is not a word.', choices: [
      { t: 'Delete it', fx: { ego: -6, xp: 26 }, r: 'Deleted. Screenshots are forever. He knows.' },
      { t: 'Declare it a word', fx: { ego: 16, fun: 12, xp: 36 }, r: '“It’s a word. I’ve always used it. The best people use it.”' },
      { t: 'Blame the phone', fx: { ego: 10, xp: 30 }, r: '“The phone has very small buttons. Not my hands. The buttons.”' },
    ] },
    { id: 'floors', title: 'Counting the Floors', text: 'A visitor has counted the floors of his building and got a smaller number than the elevator buttons.', choices: [
      { t: 'Skip a few numbers', fx: { ego: 16, xp: 34 }, r: 'The building is now ten floors taller. Construction took one afternoon and a label maker.' },
      { t: 'Count them together', fx: { ego: -8, fun: 4, xp: 28 }, r: 'You reach the top early. “We started on the wrong floor.”' },
      { t: 'Add a floor', fx: { ego: 14, xp: 34, cashH: -2 }, r: 'It is a very small floor. It counts.' },
    ] },
    { id: 'scorecard', title: 'The Scorecard', text: 'The club has posted this weekend’s results. He is listed as the winner. He was not there.', choices: [
      { t: 'Congratulate him', fx: { ego: 20, xp: 34 }, r: '“I won it in my heart. That’s where it counts. Also on the board.”' },
      { t: 'Ask how', fx: { ego: -6, fun: 6, xp: 28 }, r: '“I played a strong round on a different day. It carries over.”' },
      { t: 'Order a bigger trophy', fx: { ego: 16, fun: 8, xp: 34, cashH: -1 }, r: 'It needs its own table.' },
    ] },
    { id: 'painting', title: 'The Painting', text: 'A portrait of him has been delivered. It is, by any fair standard, accurate.', choices: [
      { t: 'Hang it facing the wall', fx: { ego: 8, xp: 28 }, r: '“Modern art,” he tells visitors.' },
      { t: 'Commission a better one', fx: { ego: 18, xp: 34, cashH: -2 }, r: 'In the new one he is taller, and there is an eagle.' },
      { t: 'Tell him it’s the lighting', fx: { ego: 12, glow: 6, xp: 30 }, r: '“Terrible lighting. The painter should be ashamed of the lighting.”' },
    ] },
    { id: 'chef', title: 'The Chef’s Suggestion', text: 'The chef has suggested medium rare.', choices: [
      { t: 'Send it back until it’s well done', fx: { food: 20, ego: 8, xp: 32 }, r: 'It returns the color of a briefcase. “Perfect.”' },
      { t: 'Bring ketchup first', fx: { food: 20, fun: 8, xp: 32 }, r: 'The chef watches from the doorway and ages visibly.' },
      { t: 'Let the chef explain', fx: { fun: -6, xp: 28 }, r: 'The chef explains. The chef now works at a different restaurant.' },
    ] },
    { id: 'rainparade', title: 'Rain on the Parade', text: 'It is raining on the parade. His parade.', choices: [
      { t: 'Say the rain stopped', fx: { ego: 14, xp: 32 }, r: '“The sun came out the moment I started. Everyone saw.” Everyone is soaked.' },
      { t: 'Find the hair a hat', fx: { glow: 14, xp: 30 }, r: 'The hat goes on. The hair is safe. Morale improves.' },
      { t: 'Postpone', fx: { ego: -6, energy: 10, xp: 26 }, r: '“We didn’t postpone. The weather did. Weak weather.”' },
    ] },
    { id: 'hat', title: 'The Hat', text: 'A box of hats has arrived. He must choose.', choices: [
      { t: 'Red', fx: { ego: 10, fun: 8, xp: 30 }, r: '“Red. Classic. Like a fire truck, and everyone loves a fire truck.”' },
      { t: 'White, for golf', fx: { fun: 14, xp: 30 }, r: 'He is on the first tee before you close the box.' },
      { t: 'Gold', fx: { ego: 16, xp: 34, cashH: -1 }, r: 'It is too heavy to wear. He wears it.' },
    ] },
    { id: 'phone', title: 'The Phone', text: 'Someone has suggested he give up his phone at night.', choices: [
      { t: 'Take the phone', fx: { energy: 16, ego: -8, xp: 30 }, r: 'He sleeps nine hours. The world has a quiet morning. He is suspicious of both.' },
      { t: 'Leave the phone', fx: { fun: 14, energy: -8, xp: 32 }, r: 'Eleven posts between midnight and dawn. Several are in capital letters.' },
      { t: 'Give him a second phone', fx: { fun: 10, ego: 8, xp: 30 }, r: 'One for each hand. “Finally, somebody thinking.”' },
    ] },
    { id: 'poll', title: 'The Poll', text: 'A new poll is out. It is not the poll he wanted.', choices: [
      { t: 'Find a better poll', fx: { ego: 18, xp: 32 }, r: 'A better poll is found. It was taken in this office. He won all three votes.' },
      { t: 'Read him the real one', fx: { ego: -12, xp: 30 }, r: '“Fake poll. They asked the wrong people. They should ask me.”' },
      { t: 'Poll the staff', fx: { ego: 14, fun: 8, xp: 32 }, r: 'Unanimous. The staff would like to keep their jobs.' },
    ] },
    { id: 'book', title: 'The Book', text: 'A publisher wants a book. He has agreed to have written one.', choices: [
      { t: 'Hire someone to write it', fx: { ego: 12, xp: 32, cashH: 2 }, r: 'It is a bestseller. He means to read it someday.' },
      { t: 'Let him dictate', fx: { fun: 14, xp: 34 }, r: 'Chapter one is forty pages about a handshake.' },
      { t: 'Make it mostly pictures', fx: { ego: 16, fun: 8, xp: 32 }, r: '“A picture is worth a thousand words. I saved them millions of words.”' },
    ] },
    { id: 'letter', title: 'A Letter From a Child', text: 'A child has written to ask what he does all day.', choices: [
      { t: 'Answer honestly', fx: { fun: 8, xp: 28 }, r: '“I win. Then I have lunch.” He signs it very large.' },
      { t: 'Send a signed photo', fx: { ego: 12, xp: 30 }, r: 'The photo is of him reading the letter.' },
      { t: 'Invite the class to visit', fx: { fun: 16, ego: 8, xp: 34 }, r: 'Thirty children. One asks about the hair. The tour ends.' },
    ] },
    { id: 'escalator', title: 'The Escalator', text: 'The escalator has stopped halfway.', choices: [
      { t: 'Walk the rest', fx: { energy: -8, ego: 10, xp: 30 }, r: '“I climbed it. People say I floated.”' },
      { t: 'Wait for it to restart', fx: { fun: 6, xp: 26 }, r: 'He waits forty minutes, waving. It is, technically, an event.' },
      { t: 'Blame the escalator', fx: { ego: 14, fun: 6, xp: 32 }, r: '“Sabotage. Nobody’s been treated worse by an escalator.”' },
    ] },
    { id: 'microphone', title: 'The Microphone', text: 'The microphone is not working. He has noticed.', choices: [
      { t: 'Fix it quietly', fx: { ego: 4, xp: 26 }, r: 'Fixed. He complains about it for ten more minutes, clearly audible.' },
      { t: 'Let him yell', fx: { fun: 12, energy: -8, xp: 32 }, r: 'He does forty minutes without it. The back row hears every word.' },
      { t: 'Don’t pay the sound company', fx: { ego: 12, fun: 6, xp: 30 }, r: '“I don’t pay people who do a bad job.” The sound company is not surprised.' },
    ] },
    { id: 'thermostat', title: 'The Thermostat', text: 'The office is two degrees off. He can tell.', choices: [
      { t: 'Make it colder', fx: { energy: 8, ego: 6, xp: 28 }, r: '“Cold. Good. Keeps people sharp. Keeps the hair firm.”' },
      { t: 'Make it warmer', fx: { glow: 6, energy: -4, xp: 26 }, r: 'The bronzer becomes a logistical problem.' },
      { t: 'Give him the dial', fx: { ego: 12, fun: 10, xp: 30 }, r: 'It is not connected to anything. He adjusts it all day, satisfied.' },
    ] },
    { id: 'eclipse', title: 'The Eclipse', text: 'There is an eclipse. Everyone has been told not to look at it.', choices: [
      { t: 'Hand him the glasses', fx: { glow: 4, xp: 28 }, r: 'He puts them on eventually. First, a quick look. Just to see.' },
      { t: 'Shout “don’t look!”', fx: { fun: 12, xp: 32 }, r: 'He looks. He points at it. He looks again.' },
      { t: 'Tell him the sun asked for him', fx: { ego: 18, xp: 32 }, r: '“The sun and I have a lot in common. People can’t look away.”' },
    ] },
    { id: 'marsflag', title: 'A Flag on Mars', text: 'He would like to put a flag on another planet. Soon.', choices: [
      { t: 'Ask when', fx: { fun: 8, xp: 28 }, r: '“Soon. Very soon. Maybe before lunch.”' },
      { t: 'Ask which flag', fx: { ego: 14, fun: 8, xp: 32 }, r: 'He sketches one. It has his face on it.' },
      { t: 'Suggest the moon first', fx: { ego: -4, xp: 26 }, r: '“We did the moon. Been there. I want the red one.”' },
    ] },
    { id: 'champions', title: 'The Champions Visit', text: 'A championship team is coming to visit. The kitchen is closed.', choices: [
      { t: 'Burgers on silver trays', fx: { food: 20, fun: 14, xp: 36 }, r: 'A thousand hamberders under candlelight. He stands behind them like a proud chef.' },
      { t: 'Order salads', fx: { ego: -8, xp: 26 }, r: 'The team eats quietly. He does not forgive you.' },
      { t: 'Pizza too', fx: { food: 14, fun: 10, xp: 32 }, r: 'Stacked in towers. “Many, many pizzas.”' },
    ] },
    { id: 'eagle', title: 'The Eagle', text: 'A bald eagle has been brought in for a photograph. It does not like him.', choices: [
      { t: 'Keep taking pictures', fx: { fun: 14, glow: -8, xp: 34 }, r: 'The eagle goes for the hair. The photographs are remarkable.' },
      { t: 'Swap in a statue', fx: { ego: 10, xp: 30 }, r: 'The statue is very well behaved. “Much better eagle.”' },
      { t: 'Let the eagle sit at the desk', fx: { fun: 12, xp: 30 }, r: 'It looks more presidential than anyone expected. He notices.' },
    ] },
    { id: 'truck', title: 'The Big Truck', text: 'There is a very large truck parked on the lawn. He has been invited to sit in it.', choices: [
      { t: 'Let him honk', fx: { fun: 20, xp: 34 }, r: 'He honks for six minutes. He has never been happier.' },
      { t: 'Let him pretend to drive', fx: { fun: 16, ego: 6, xp: 32 }, r: 'Both hands on the wheel, face of pure concentration. The truck is off.' },
      { t: 'Keep the meeting on schedule', fx: { fun: -10, xp: 26 }, r: 'He looks at the truck through the window for the rest of the meeting.' },
    ] },
    { id: 'coloring', title: 'The Coloring Page', text: 'At a visit with schoolchildren he has been given a flag to color in.', choices: [
      { t: 'Hand him the right crayons', fx: { ego: 6, xp: 28 }, r: 'He adds a blue stripe anyway. “It’s better.”' },
      { t: 'Let him freestyle', fx: { fun: 14, xp: 32 }, r: 'There is gold on it now. The children respect the confidence.' },
      { t: 'Have him sign it', fx: { ego: 14, xp: 30 }, r: 'The signature covers the whole flag. It is the art.' },
    ] },
    { id: 'tape', title: 'The Tie', text: 'The back of his tie is held to the front with tape.', choices: [
      { t: 'Say nothing', fx: { ego: 6, xp: 26 }, r: 'The wind says something.' },
      { t: 'Offer a tie clip', fx: { ego: -4, glow: 6, xp: 28 }, r: '“A clip? Tape is faster. Tape is modern.”' },
      { t: 'Get the good tape', fx: { glow: 10, ego: 8, xp: 30 }, r: 'Clear, strong, invisible from most angles. “This is the tape.”' },
    ] },
    { id: 'exectime', title: 'Executive Time', text: 'Today’s schedule has nine hours marked “Executive Time.”', choices: [
      { t: 'Protect the block', fx: { fun: 16, energy: 8, xp: 32 }, r: 'Television, phone calls, television. It is, he says, when the real work happens.' },
      { t: 'Add one meeting', fx: { fun: -8, xp: 30 }, r: 'He attends it from the other room, with the sound up.' },
      { t: 'Rename it “Winning Time”', fx: { ego: 14, fun: 8, xp: 32 }, r: 'Same nine hours. He feels much more productive.' },
    ] },
    { id: 'nametag', title: 'The Name', text: 'A very important company boss is visiting. He has forgotten the name.', choices: [
      { t: 'Whisper it to him', fx: { ego: 4, xp: 26 }, r: 'He hears it. He says something else, with total confidence.' },
      { t: 'Let him improvise', fx: { fun: 14, xp: 32 }, r: '“Great to see you, Tim Company.” The boss quietly changes his name tag.' },
      { t: 'Name tags for everyone', fx: { fun: 8, ego: 6, xp: 30 }, r: 'His says “ME.”' },
    ] },
    { id: 'playlist', title: 'The Playlist', text: 'The rally needs music.', choices: [
      { t: 'The same song again', fx: { fun: 16, xp: 32 }, r: 'He does the dance. Two fists, small punches. The crowd does it back.' },
      { t: 'Something new', fx: { fun: -6, xp: 26 }, r: 'He stands very still for three minutes, waiting for it to be over.' },
      { t: 'Forty minutes of just music', fx: { fun: 14, energy: -6, xp: 32 }, r: 'Nobody asks a single question. He sways. It is his favorite rally.' },
    ] },
    { id: 'checkup', title: 'The Checkup', text: 'The doctor’s report is due.', choices: [
      { t: 'Let him write it', fx: { ego: 20, xp: 34 }, r: '“Healthiest ever. Astonishingly excellent.” The doctor signs with a shaking hand.' },
      { t: 'Read the real one', fx: { ego: -8, food: -6, xp: 28 }, r: 'It mentions vegetables. He stops reading.' },
      { t: 'Skip to the height', fx: { ego: 14, xp: 30 }, r: 'He has grown an inch. At his age. A miracle.' },
    ] },
    { id: 'memory', title: 'The Memory Test', text: 'He has taken a test. He would like to tell you about the test.', choices: [
      { t: 'Ask him the five words', fx: { ego: 18, fun: 10, xp: 34 }, r: 'He says them in order. Then again. Then once more for the people in the back.' },
      { t: 'Tell him it’s not a hard test', fx: { ego: -10, xp: 28 }, r: '“The last five questions are very hard. Very. You wouldn’t know.”' },
      { t: 'Frame the results', fx: { ego: 14, xp: 32, cashH: -1 }, r: 'It hangs between the portraits. Visitors are tested on it.' },
    ] },
    { id: 'cards', title: 'The Trading Cards', text: 'He would like to sell pictures of himself as a superhero.', choices: [
      { t: 'Astronaut card', fx: { ego: 14, xp: 32, cashH: 2 }, r: 'It sells out. In the picture he is not wearing a helmet. He doesn’t need one.' },
      { t: 'Cowboy card', fx: { ego: 12, fun: 8, xp: 32, cashH: 2 }, r: 'The horse is also wearing a long tie.' },
      { t: 'Suggest a normal photo', fx: { ego: -6, xp: 26 }, r: '“Normal doesn’t sell. I’ve never sold a normal thing in my life.”' },
    ] },
    { id: 'cologne', title: 'The Fragrance', text: 'He is launching a cologne.', choices: [
      { t: 'Call it “Victory”', fx: { ego: 14, xp: 32, cashH: 1 }, r: 'It smells like a new car and a steakhouse. It sells.' },
      { t: 'Call it “Me”', fx: { ego: 18, xp: 32, cashH: 1 }, r: '“You put it on, you smell like winning. Like me.”' },
      { t: 'Ask what it smells like', fx: { fun: 8, xp: 28 }, r: '“Success.” He will not elaborate.' },
    ] },
    { id: 'fryer', title: 'The Fry Station', text: 'He wants to work a shift at a burger place. Just the fries.', choices: [
      { t: 'Get him an apron', fx: { fun: 18, food: 10, xp: 36 }, r: 'He salts with a flourish and hands bags out the window. “I’ve now worked here longer than anyone.”' },
      { t: 'Taste-testing only', fx: { food: 20, fun: 8, xp: 32 }, r: 'Quality control is thorough. Inventory suffers.' },
      { t: 'Warn him about the oil', fx: { glow: -6, fun: 10, xp: 30 }, r: 'The hair survives. The apron does not.' },
    ] },
    { id: 'flagpole', title: 'The Flagpole', text: 'He wants a flagpole. A tall one.', choices: [
      { t: 'Tall', fx: { ego: 12, xp: 30, cashH: -1 }, r: '“Taller.”' },
      { t: 'Taller', fx: { ego: 16, xp: 34, cashH: -2 }, r: 'Aircraft have been notified.' },
      { t: 'Two flagpoles', fx: { ego: 18, fun: 6, xp: 34, cashH: -2 }, r: 'One for each lawn. He salutes both. It takes a while.' },
    ] },
    { id: 'patio', title: 'The Lawn', text: 'He has looked at the garden and concluded it would be better as a patio.', choices: [
      { t: 'Pave it', fx: { ego: 12, xp: 32, cashH: -2 }, r: 'Stone, umbrellas, a speaker playing his rally songs. “Now it’s a garden.”' },
      { t: 'Save one rose', fx: { fun: 6, xp: 28 }, r: 'The rose gets a plaque. The plaque is about him.' },
      { t: 'Suggest gold gravel', fx: { ego: 16, xp: 32, cashH: -2 }, r: 'You cannot look directly at the lawn at noon.' },
    ] },
    { id: 'clocks', title: 'The Clocks', text: 'The clocks changed last night. He did not approve the change.', choices: [
      { t: 'Change them back', fx: { ego: 12, fun: 6, xp: 30 }, r: 'The office is now an hour off from the rest of the building. He is on time. Everyone else is wrong.' },
      { t: 'Abolish the time change', fx: { ego: 14, fun: 8, xp: 34 }, r: '“One time. The best time. All year.”' },
      { t: 'Give him the extra hour', fx: { energy: 14, xp: 28 }, r: 'He uses it for executive time.' },
    ] },
    { id: 'penny', title: 'The Penny', text: 'He has learned what it costs to make a penny.', choices: [
      { t: 'Stop making pennies', fx: { ego: 12, fun: 8, xp: 32 }, r: '“Wasteful. I know waste. I’ve seen it. Mostly other people’s.”' },
      { t: 'Put his face on it', fx: { ego: 20, xp: 34 }, r: 'It is now worth two cents, he estimates.' },
      { t: 'Make a bigger coin', fx: { ego: 14, xp: 32, cashH: -1 }, r: 'The size of a dinner plate. Vending machines are not ready.' },
    ] },
    { id: 'cointoss', title: 'The Big Game', text: 'He has been invited to the big game.', choices: [
      { t: 'Do the coin toss', fx: { ego: 14, fun: 12, xp: 34 }, r: 'He calls it in the air. For himself. He wins.' },
      { t: 'Sit in the best box', fx: { ego: 12, food: 12, xp: 32 }, r: 'He watches the screen that shows the box.' },
      { t: 'Leave at halftime', fx: { fun: -4, energy: 8, xp: 26 }, r: '“I saw enough. I knew who’d win. I always know.”' },
    ] },
    { id: 'chess', title: 'Four-Dimensional Chess', text: 'People say he is playing four-dimensional chess. There is a regular chessboard on the desk.', choices: [
      { t: 'Play him', fx: { fun: 12, xp: 30 }, r: 'He moves a pawn sideways. “That’s the fourth dimension.”' },
      { t: 'Let him win', fx: { ego: 16, fun: 8, xp: 32 }, r: 'Checkmate in three. Two of the moves were his.' },
      { t: 'Switch to checkers', fx: { fun: 14, xp: 30 }, r: 'He kings himself immediately.' },
    ] },
    { id: 'statue', title: 'The Statue', text: 'A sculptor has offered to make a statue of him.', choices: [
      { t: 'Life-size', fx: { ego: 8, xp: 28 }, r: '“Life-size? What’s the point of that?”' },
      { t: 'Twice life-size', fx: { ego: 16, xp: 34, cashH: -2 }, r: 'It does not fit through the door. The door is the problem.' },
      { t: 'Solid gold', fx: { ego: 22, xp: 36, cashH: -3 }, r: 'The floor has been reinforced.' },
    ] },
    { id: 'autograph', title: 'The Autograph', text: 'A fan would like something signed.', choices: [
      { t: 'A hat', fx: { ego: 10, xp: 28 }, r: 'Signed across the front. It can no longer be read as a hat.' },
      { t: 'A hamberder', fx: { fun: 14, food: 8, xp: 32 }, r: 'He signs the wrapper, then eats the evidence.' },
      { t: 'The fan’s cast', fx: { ego: 12, fun: 8, xp: 30 }, r: 'There is no room left on the cast for anyone else.' },
    ] },
    { id: 'title', title: 'The Title', text: 'A very long document needs a name.', choices: [
      { t: '“The Big One”', fx: { ego: 10, xp: 30 }, r: '“Bigger.”' },
      { t: '“The Big Beautiful One”', fx: { ego: 16, fun: 8, xp: 34 }, r: 'He underlines “Beautiful” twice.' },
      { t: 'Name it after him', fx: { ego: 20, xp: 34 }, r: 'The title now takes up the first page.' },
    ] },
    { id: 'interview', title: 'The Interview', text: 'A television interview is scheduled. The questions were not sent ahead.', choices: [
      { t: 'Walk out early', fx: { ego: 8, fun: 10, xp: 32 }, r: 'He leaves mid-question. The chair spins for a while.' },
      { t: 'Rate the interviewer', fx: { ego: 12, fun: 8, xp: 32 }, r: '“Nasty questions. Very nasty. I gave great answers. The best answers.”' },
      { t: 'Interview himself', fx: { ego: 20, xp: 34 }, r: 'Tough but fair. He does extremely well.' },
    ] },
    { id: 'crossword', title: 'The Crossword', text: 'He is stuck on seven across. Nine letters, “very good.”', choices: [
      { t: 'Point out TREMENDOUS doesn’t fit', fx: { fun: 10, xp: 28 }, r: '“It fits if you write smaller.”' },
      { t: 'Suggest EXCELLENT', fx: { ego: -4, xp: 26 }, r: '“Low-energy word.” He writes TREMENDOUS anyway.' },
      { t: 'Let him invent a word', fx: { fun: 14, ego: 8, xp: 32 }, r: 'Nine letters exactly. Nobody has seen it before. It is now the answer.' },
    ] },
    { id: 'elevator', title: 'The Golden Elevator', text: 'The elevator is being redone. He has been asked what finish.', choices: [
      { t: 'Gold', fx: { ego: 12, xp: 30, cashH: -1 }, r: '“Obviously.”' },
      { t: 'More gold', fx: { ego: 16, xp: 32, cashH: -2 }, r: 'The buttons are gold. The numbers on the buttons are gold. It is hard to find your floor.' },
      { t: 'Mirrors', fx: { ego: 20, xp: 32, cashH: -1 }, r: 'He rides it for an hour.' },
    ] },
    { id: 'nap', title: 'The Nap', text: 'He has been found with his eyes closed in a meeting.', choices: [
      { t: 'Say he was listening hard', fx: { ego: 12, energy: 10, xp: 30 }, r: '“Deep listening. I heard everything. It was all about me.”' },
      { t: 'Let him sleep', fx: { energy: 20, xp: 28 }, r: 'He wakes at the end and says, “Agreed.” The meeting is considered a success.' },
      { t: 'Wake him gently', fx: { ego: -6, energy: 6, xp: 26 }, r: '“I wasn’t sleeping. I don’t sleep. I was blinking for a long time.”' },
    ] },
    { id: 'lostpen', title: 'The Missing Pen', text: 'The good pen is gone. The signing is in ten minutes.', choices: [
      { t: 'Search the office', fx: { fun: 10, energy: -6, xp: 32 }, r: 'It was behind his ear. It had been there since Tuesday.' },
      { t: 'Blame the pen', fx: { ego: 12, xp: 30 }, r: '“Disloyal pen. Never liked it.” A new pen is sworn in.' },
      { t: 'Sign with a hamberder', fx: { food: 10, fun: 12, xp: 36 }, r: 'The document is legally binding and lightly seasoned.' },
    ] },
    { id: 'weathername', title: 'A Nickname for the Weather', text: 'It is drizzling. He feels this is personal.', choices: [
      { t: '“Drippy Drizzle”', fx: { fun: 14, xp: 32 }, r: '“Drippy Drizzle. Low energy. Look at it, just falling.” The drizzle continues, chastened.' },
      { t: '“Crooked Cloud”', fx: { ego: 10, fun: 8, xp: 32 }, r: 'The cloud moves on within the hour. He takes full credit.' },
      { t: 'Sign an order against it', fx: { ego: 16, xp: 38 }, r: 'The order is laminated, which turns out to be the smart part.' },
    ] },
    { id: 'mirror', title: 'The New Mirror', text: 'A new mirror has been delivered. It is the honest kind.', choices: [
      { t: 'Send it back', fx: { ego: 12, xp: 32 }, r: 'The mirror is returned with a note: “Not a team player.”' },
      { t: 'Negotiate with it', fx: { fun: 14, ego: 6, xp: 36 }, r: 'After an hour the mirror agrees he looks “fantastic, frankly”. Nobody saw who said it.' },
      { t: 'Look anyway', fx: { ego: -6, glow: 10, xp: 40 }, r: 'He looks. He moves one hair. “Fixed it. Was perfect before. More perfect now.”' },
    ] },
    { id: 'anthem', title: 'The Office Anthem', text: 'The office needs an anthem. Three demos have arrived.', choices: [
      { t: 'The one with trumpets', fx: { fun: 14, xp: 32 }, r: 'Ninety seconds of trumpets and his name. He requests the long version.' },
      { t: 'The one he hummed himself', fx: { ego: 18, xp: 36 }, r: 'Four notes, repeated. “Catchy. People will hum this for a thousand years.”' },
      { t: 'All three at once', fx: { fun: 18, energy: -6, xp: 38 }, r: 'It is very loud. He conducts with a hamberder.' },
    ] },
    { id: 'souvenir', title: 'The Gift Shop', text: 'The gift shop wants a new souvenir with his face on it.', choices: [
      { t: 'A mug', fx: { ego: 10, xp: 30, cashH: 1 }, r: 'It holds exactly one Diet Coke. Sold out by noon.' },
      { t: 'A bigger mug', fx: { ego: 16, xp: 34, cashH: 1 }, r: 'Nobody can lift it. It is displayed, like art.' },
      { t: 'A golden everything', fx: { glow: 10, ego: 10, xp: 36 }, r: 'A golden paperclip goes on sale for the price of a car. It is the best-selling paperclip in history.' },
    ] },
    { id: 'lunchorder', title: 'The Lunch Order', text: 'The kitchen has asked, bravely, whether he would like to try something new.', choices: [
      { t: 'The usual', fx: { food: 16, xp: 30 }, r: 'Two of everything he had yesterday. The kitchen breathes out.' },
      { t: 'The usual, but more', fx: { food: 22, energy: -4, xp: 34 }, r: 'A tower of hamberders arrives. He salutes it.' },
      { t: 'Something new', fx: { food: 8, fun: 10, xp: 40 }, r: 'He tries it. He chews for a long time. “Interesting. Never again. Loved it.”' },
    ] },
    { id: 'recordbook', title: 'The Record Book', text: 'A man from the record book is here with a tape measure and a clipboard.', choices: [
      { t: 'Longest tie', fx: { ego: 14, xp: 34 }, r: 'Certified. The man needs a second tape measure.' },
      { t: 'Most compliments received', fx: { ego: 20, xp: 36 }, r: 'He supplies the figures himself. The man writes them down. It is easier.' },
      { t: 'Fastest signature', fx: { fun: 14, xp: 36 }, r: 'Too fast to time. The pen is still warm.' },
    ] },
    { id: 'nightlight', title: 'The Night Light', text: 'He has asked for a night light. For security reasons.', choices: [
      { t: 'A small gold one', fx: { energy: 12, xp: 30 }, r: 'It glows faintly. He glows back. They get along.' },
      { t: 'A chandelier, dimmed', fx: { glow: 10, energy: 8, xp: 34 }, r: 'It takes four people to dim it. He sleeps wonderfully.' },
      { t: 'Leave the TV on', fx: { fun: 10, energy: 6, xp: 32 }, r: 'The TV is showing him. He falls asleep watching himself fall asleep.' },
    ] },
    // From here on, briefings that only arrive once he is the thing they are about (`min` is a level).
    { id: 'polish', min: 55, title: 'Polishing Day', text: 'He has been gold for a week. There is a smudge.', choices: [
      { t: 'The soft cloth', fx: { glow: 20, xp: 40 }, r: 'Buffed to a mirror finish. He spends the afternoon watching people look at themselves in him.' },
      { t: 'The car wash', fx: { fun: 16, glow: 10, xp: 42 }, r: 'He takes the deluxe. Twice. The wax is “very presidential”.' },
      { t: 'Deny the smudge', fx: { ego: 18, xp: 38 }, r: '“There is no smudge. It’s a beauty mark. Gold has them.”' },
    ] },
    { id: 'weighin', min: 55, title: 'The Weigh-In', text: 'A jeweller has asked, very politely, what he weighs now.', choices: [
      { t: 'Step on the scale', fx: { ego: 14, xp: 40 }, r: 'The scale shows a price instead of a number. He is delighted with the price.' },
      { t: 'Refuse. It is classified', fx: { ego: 10, fun: 8, xp: 38 }, r: '“Nobody knows. Could be the most anything has ever weighed.”' },
      { t: 'Weigh the jeweller instead', fx: { fun: 18, xp: 40 }, r: 'The jeweller is very light. “Sad,” he says, kindly.' },
    ] },
    { id: 'hairvote', min: 62, title: 'The Hair Has a Proposal', text: 'The hair would like to be consulted before decisions. It has prepared remarks.', choices: [
      { t: 'Let it speak', fx: { glow: 16, ego: 6, xp: 44 }, r: 'Forty minutes, no notes. A standing ovation from him, who was already standing under it.' },
      { t: 'Overrule the hair', fx: { ego: 12, glow: -10, xp: 40 }, r: 'The hair says nothing. It simply droops, slightly, on one side, all day.' },
      { t: 'Make it vice president', fx: { glow: 12, fun: 12, xp: 46 }, r: 'It is sworn in. It does not blink. It can. It chooses not to.' },
    ] },
    { id: 'hairdoor', min: 62, title: 'The Doorway Problem', text: 'The hair no longer fits through the door.', choices: [
      { t: 'Duck', fx: { energy: -6, fun: 8, xp: 40 }, r: 'He has never ducked. He does it wrong, upward.' },
      { t: 'Widen the door', fx: { ego: 14, xp: 42 }, r: 'The door is now most of the wall. The wall has been thanked for its service.' },
      { t: 'The hair goes first', fx: { glow: 14, fun: 8, xp: 44 }, r: 'It checks the room, nods, and waves him in.' },
    ] },
    { id: 'tielost', min: 70, title: 'Where Does It End?', text: 'A search party has gone looking for the end of the tie.', choices: [
      { t: 'Send a second party', fx: { fun: 14, xp: 44 }, r: 'The second party finds the first. They are fine. They have started a small town.' },
      { t: 'Tug it and see', fx: { fun: 18, energy: -6, xp: 46 }, r: 'Somewhere far away a flagpole falls over. He decides not to tug again.' },
      { t: 'Declare it endless', fx: { ego: 18, xp: 42 }, r: '“It doesn’t end. Like me.” The search party is told to keep the snacks.' },
    ] },
    { id: 'tietoll', min: 70, title: 'The Tie Crosses a Bridge', text: 'The tie has reached a toll bridge. The toll keeper has questions.', choices: [
      { t: 'Pay the toll', fx: { ego: -4, fun: 10, xp: 42 }, r: 'One tie, one axle. It comes to very little. He frames the receipt.' },
      { t: 'The tie is the bridge now', fx: { ego: 16, fun: 10, xp: 46 }, r: 'Traffic uses the tie. It holds. It was always a very strong tie.' },
      { t: 'Charge the bridge', fx: { ego: 14, xp: 42, cashH: 1 }, r: 'The bridge pays him. Nobody understands how. It keeps happening.' },
    ] },
    { id: 'cloudmtg', min: 78, title: 'A Cloud Is in the Way', text: 'A cloud has parked directly in front of his face.', choices: [
      { t: 'Blow on it', fx: { fun: 16, xp: 46 }, r: 'The cloud leaves. So does the weather, for three states.' },
      { t: 'Wear it', fx: { glow: 14, fun: 8, xp: 46 }, r: 'A cloud, worn as a scarf. “Very soft. Very few people could do this.”' },
      { t: 'Wait', fx: { energy: 10, xp: 42 }, r: 'He outwaits a cloud and adds it to his list of wins. The list is long.' },
    ] },
    { id: 'cityplan', min: 78, title: 'The City Would Like a Word', text: 'The city has asked, respectfully, where he plans to stand.', choices: [
      { t: 'Where he is', fx: { ego: 16, xp: 44 }, r: 'Maps are reprinted with a large gold area marked “HIM”.' },
      { t: 'In the park', fx: { fun: 14, xp: 44 }, r: 'He is now most of the park. Attendance triples.' },
      { t: 'One foot in each district', fx: { ego: 10, fun: 12, xp: 46 }, r: 'Both districts claim him. He lets them.' },
    ] },
    { id: 'tenants', min: 86, title: 'The Tenants’ Meeting', text: 'The people on his thirty-first floor have a complaint about the noise. The noise is him.', choices: [
      { t: 'Lower his voice', fx: { ego: -6, energy: 8, xp: 44 }, r: 'He whispers. The windows still rattle, but politely.' },
      { t: 'Raise the rent', fx: { ego: 16, xp: 46, cashH: 2 }, r: 'They pay. The view is of him. It is worth it.' },
      { t: 'Sing them something', fx: { fun: 18, xp: 46 }, r: 'One note. Every floor hums along for a week.' },
    ] },
    { id: 'windowwash', min: 86, title: 'Window Washing Day', text: 'A crew is coming to wash his windows. All of them.', choices: [
      { t: 'Hold very still', fx: { glow: 20, xp: 46 }, r: 'He sparkles from lobby to roof. He catches the sun, and three planes have to squint.' },
      { t: 'Giggle', fx: { fun: 18, glow: 8, xp: 46 }, r: 'It tickles. The whole block feels it. The crew holds on and finishes the job.' },
      { t: 'Wash them himself', fx: { ego: 10, glow: 12, energy: -8, xp: 48 }, r: 'He cannot reach. He hires the crew back, with a bonus.' },
    ] },
    { id: 'moonname', min: 93, title: 'A New Moon', text: 'A small moon has started orbiting him. It needs a name.', choices: [
      { t: '“Don Junior”', fx: { ego: 16, xp: 48 }, r: 'The moon orbits a little faster. It knows.' },
      { t: '“Hamberder”', fx: { food: 14, fun: 12, xp: 48 }, r: 'It is round and he loves it. He promises not to eat it.' },
      { t: 'Fire it', fx: { ego: 10, fun: 10, xp: 46 }, r: 'The moon is fired. It keeps orbiting. There is nowhere else to go. He rehires it.' },
    ] },
    { id: 'telescope', min: 93, title: 'They Are Looking at Him', text: 'Every telescope on the old planet is pointed at him tonight.', choices: [
      { t: 'Smile', fx: { ego: 18, glow: 8, xp: 48 }, r: 'The pictures come out perfect. They always do at that distance.' },
      { t: 'Turn his good side', fx: { glow: 16, xp: 48 }, r: 'It takes nine hours to turn. Worth it. All of his sides are his good side.' },
      { t: 'Wave', fx: { fun: 16, xp: 48 }, r: 'He has no hands. A storm the size of a continent waves for him.' },
    ] },
    { id: 'edge', min: 100, title: 'The Edge of Him', text: 'Explorers have set out to find where he ends.', choices: [
      { t: 'Wish them luck', fx: { ego: 14, fun: 10, xp: 50 }, r: 'They never find it. They send postcards. All of the postcards are of him.' },
      { t: 'Move the edge', fx: { ego: 20, xp: 50 }, r: 'He gets a little bigger, just to be safe.' },
      { t: 'Tell them there is no edge', fx: { fun: 16, xp: 50 }, r: '“There’s no outside. I checked. It was doing badly, so I bought it.”' },
    ] },
    { id: 'quiet', min: 100, title: 'A Quiet Moment', text: 'For one second, everything that exists is quiet. Everything that exists is him.', choices: [
      { t: 'Enjoy it', fx: { energy: 14, fun: 8, xp: 50 }, r: 'One second. Then he posts about how quiet it was.' },
      { t: 'Fill it', fx: { ego: 16, xp: 50 }, r: '“Is this thing on?” It is. He is the thing.' },
      { t: 'Ask if anyone is there', fx: { ego: 8, fun: 14, xp: 52 }, r: 'You are. He seems honestly glad. He will deny it later.' },
    ] },
  ];
  // One special briefing per special day, offered once a year in place of the regular one.
  C.SEASON_BRIEFINGS = {
    newyear: { id: 'newyear', title: 'New Year’s Resolutions', text: 'It is January first. He has been asked for a resolution.', choices: [
      { t: '“Be even better”', fx: { ego: 18, xp: 50 }, r: '“It’ll be hard. I’m already at the top. But I’ll find a way.”' },
      { t: '“More salads”', fx: { ego: -6, fun: 10, xp: 50 }, r: 'He laughs for a full minute. A good start to the year.' },
      { t: '“No resolution needed”', fx: { ego: 22, xp: 50 }, r: '“You don’t fix what’s perfect.” Resolution accomplished.' },
    ] },
    inaug: { id: 'inaug', title: 'The Anniversary', text: 'It is the anniversary of the big day. He would like to discuss the crowd.', choices: [
      { t: 'It was the biggest', fx: { ego: 26, xp: 50 }, r: '“Period.” He says the word “period” out loud.' },
      { t: 'Look at the photos together', fx: { ego: -8, fun: 6, xp: 50 }, r: 'He turns the photo over. The back is blank. “Better.”' },
      { t: 'Re-enact it in the office', fx: { fun: 20, ego: 12, xp: 50 }, r: 'You are the crowd. You are, he says, enormous.' },
    ] },
    groundhog: { id: 'groundhog', title: 'Groundhog Day', text: 'A groundhog has made a weather forecast. He disagrees with it.', choices: [
      { t: 'Sharpie the shadow', fx: { fun: 16, ego: 10, xp: 50 }, r: 'The shadow now points where he said it would.' },
      { t: 'Fire the groundhog', fx: { fun: 14, xp: 50 }, r: '“Low-energy rodent.” A new groundhog is being interviewed.' },
      { t: 'Let him forecast instead', fx: { ego: 18, xp: 50 }, r: '“Beautiful weather. The best. For six more weeks, or however long.”' },
    ] },
    superbowl: { id: 'superbowl', title: 'Big Game Sunday', text: 'The biggest game of the year is on. He has opinions about the snacks.', choices: [
      { t: 'Wings, eaten with a fork', fx: { food: 25, fun: 10, xp: 50 }, r: 'Not one drop on the tie. It is the day’s real athletic feat.' },
      { t: 'Predict the score', fx: { ego: 14, fun: 12, xp: 50 }, r: 'He predicts both teams will lose to him.' },
      { t: 'Watch only the halftime show', fx: { fun: 18, xp: 50 }, r: '“My rallies are bigger.” He watches the whole thing.' },
    ] },
    valentine: { id: 'valentine', title: 'Valentine’s Day', text: 'The mail has come. There is one valentine. It is in his handwriting.', choices: [
      { t: 'Read it aloud', fx: { ego: 22, xp: 50 }, r: '“To the greatest. From the greatest.” He is moved.' },
      { t: 'Give him one from you', fx: { ego: 16, fun: 14, xp: 50 }, r: 'He checks the envelope for a second card. Then he smiles. Slightly.' },
      { t: 'Chocolates', fx: { food: 20, fun: 12, xp: 50 }, r: 'He eats the top layer and asks who took the bottom layer.' },
    ] },
    presidents: { id: 'presidents', title: 'Presidents’ Day', text: 'Historians have published a ranking. He has asked to see only the top.', choices: [
      { t: 'Put him first', fx: { ego: 28, xp: 50 }, r: '“Finally. Real historians.”' },
      { t: 'Put him in the top five', fx: { ego: -4, fun: 6, xp: 50 }, r: '“Top five? Who are the other four? What did they build?”' },
      { t: 'Add him to the mountain picture', fx: { ego: 24, fun: 10, xp: 50 }, r: 'You draw him in with a Sharpie. He hangs it up.' },
    ] },
    leapday: { id: 'leapday', title: 'The Extra Day', text: 'This year has an extra day. He would like to know who approved that.', choices: [
      { t: 'Name the day after him', fx: { ego: 22, xp: 50 }, r: 'It comes once every four years. “Like a term,” he says.' },
      { t: 'Use it for golf', fx: { fun: 22, xp: 50 }, r: 'A whole free day. He plays thirty-six holes and counts eighteen.' },
      { t: 'Tell him he gets paid for it', fx: { ego: 10, xp: 50, cashH: 4 }, r: '“An extra day of licensing. I love this day.”' },
    ] },
    stpatrick: { id: 'stpatrick', title: 'St. Patrick’s Day', text: 'Everyone is wearing green. He owns no green.', choices: [
      { t: 'A green tie', fx: { glow: 10, fun: 12, xp: 50 }, r: 'Extra long. It looks like a vine. He likes it.' },
      { t: 'Gold counts', fx: { ego: 16, xp: 50 }, r: '“Gold is what’s at the end. I skipped the rainbow.”' },
      { t: 'A green hamberder', fx: { food: 20, fun: 8, xp: 50 }, r: 'He studies it. He eats it. He asks never to see one again.' },
    ] },
    aprilfools: { id: 'aprilfools', title: 'April Fools’ Day', text: 'It is April first. Someone will be pranked. He assumes it cannot be him.', choices: [
      { t: 'Tell him the hair is flat', fx: { fun: 10, ego: -8, glow: 6, xp: 50 }, r: 'He runs to the mirror. It is fine. You are forgiven by Thursday.' },
      { t: 'Tell him he’s won a prize', fx: { ego: 14, fun: 10, xp: 50 }, r: 'He has written the speech by the time you say “April Fools.” He gives it anyway.' },
      { t: 'Let him prank you', fx: { fun: 20, xp: 50 }, r: '“You’re fired.” Long pause. “April Fools.” He laughs for an hour.' },
    ] },
    easter: { id: 'easter', title: 'The Egg Roll', text: 'There are children, spoons and a great many eggs on the lawn.', choices: [
      { t: 'Let him blow the whistle', fx: { fun: 18, ego: 10, xp: 50 }, r: 'He blows it eleven times. The race starts on the fourth.' },
      { t: 'Gold eggs', fx: { ego: 16, xp: 50, cashH: -1 }, r: 'The children cannot lift them. He calls it a learning experience.' },
      { t: 'Stand him next to the bunny', fx: { fun: 14, xp: 50 }, r: 'He does not look at the bunny. The bunny does not look at him. The photo is famous.' },
    ] },
    hamburger: { id: 'hamburger', title: 'National Hamberder Day', text: 'It is the national day of his favorite food. He considers it a personal holiday.', choices: [
      { t: 'A tower of them', fx: { food: 40, fun: 14, xp: 55 }, r: 'Stacked like a wedding cake. He takes the top one, with ceremony.' },
      { t: 'One perfect hamberder', fx: { food: 28, ego: 12, xp: 55 }, r: 'On a silver tray, under a dome. He applauds it.' },
      { t: 'Name one after him', fx: { food: 20, ego: 22, xp: 55 }, r: 'It is the same hamberder. It costs more. He is very proud.' },
    ] },
    birthday: { id: 'birthday', title: 'His Birthday', text: 'It is June 14th. He has mentioned it nine times before breakfast.', choices: [
      { t: 'Parade', fx: { ego: 30, fun: 20, xp: 60 }, r: 'It goes past the window twice. He salutes everything.' },
      { t: 'Cake with far too many candles', fx: { food: 25, ego: 16, fun: 16, xp: 60 }, r: '“That is NOT the right number of candles. Fewer.”' },
      { t: 'Sing', fx: { ego: 24, fun: 14, xp: 60 }, r: 'He conducts. He also sings the loudest. To himself.' },
    ] },
    july4: { id: 'july4', title: 'The Fourth', text: 'Tonight there are fireworks. He would like more of them.', choices: [
      { t: 'Double the fireworks', fx: { fun: 20, ego: 12, xp: 55, cashH: -2 }, r: 'The finale lasts forty minutes. Dogs in three counties file complaints.' },
      { t: 'A speech first', fx: { ego: 20, xp: 55 }, r: 'It runs long. The fireworks start during it. He takes this as applause.' },
      { t: 'Sparklers', fx: { fun: 14, xp: 55 }, r: 'He writes his name in the air. All of it.' },
    ] },
    laborday: { id: 'laborday', title: 'Labor Day', text: 'It is a day to honor hard work. He would like it noted that nobody works harder.', choices: [
      { t: 'Note it', fx: { ego: 22, xp: 50 }, r: 'It is noted, framed and hung.' },
      { t: 'Give the staff the day off', fx: { fun: 10, ego: -4, xp: 50 }, r: 'He answers his own phone. “Who is this? How did you get this number?” It is his number.' },
      { t: 'Grill something', fx: { food: 28, fun: 12, xp: 50 }, r: 'He supervises the grill from a chair. The burgers are, he says, his recipe.' },
    ] },
    halloween: { id: 'halloween', title: 'Halloween', text: 'There will be trick-or-treaters. He needs a costume.', choices: [
      { t: 'Go as himself', fx: { ego: 20, xp: 50 }, r: '“Scariest costume there is, they tell me. Also the best-looking.”' },
      { t: 'A superhero', fx: { fun: 16, ego: 8, xp: 50 }, r: 'The cape is red and reaches the floor. So does the tie.' },
      { t: 'Just hand out candy', fx: { fun: 12, food: 10, xp: 50 }, r: 'Full-size bars. “I don’t do fun-size. Nothing about me is fun-size.”' },
    ] },
    turkey: { id: 'turkey', title: 'The Turkey Pardon', text: 'Two turkeys have been brought to the office. Only one can receive the official pardon.', choices: [
      { t: 'Pardon the big one, “Gobble”', fx: { ego: 14, fun: 16, xp: 50, ach: 'turkey' }, r: '“A full and complete pardon. He’s a winner. Look at the size of him.”' },
      { t: 'Pardon the small one, “Waddle”', fx: { ego: 8, fun: 18, xp: 50, ach: 'turkey' }, r: '“Low energy bird. But loyal. I like loyal.”' },
      { t: 'Pardon both, and himself, just in case', fx: { ego: 22, fun: 12, xp: 50, ach: 'turkey' }, r: '“Everybody’s pardoned. Me most of all. Beautiful ceremony.”' },
    ] },
    blackfriday: { id: 'blackfriday', title: 'Black Friday', text: 'Everything is on sale. He admires a deal.', choices: [
      { t: 'Buy something at half price', fx: { fun: 12, xp: 50, cashH: 1 }, r: '“I got it for half. I’d have paid a quarter.”' },
      { t: 'Sell something at double', fx: { ego: 14, xp: 50, cashH: 3 }, r: 'The sign says SALE. The price went up. People line up anyway.' },
      { t: 'Stay in', fx: { energy: 14, food: 14, xp: 50 }, r: 'Leftover turkey, well done, with ketchup. A quiet victory.' },
    ] },
    christmas: { id: 'christmas', title: 'The Tree', text: 'The tree is up. It needs something on top.', choices: [
      { t: 'A star', fx: { fun: 12, xp: 50 }, r: '“Good. Classic. Could be bigger.”' },
      { t: 'A gold star', fx: { ego: 14, fun: 8, xp: 50, cashH: -1 }, r: 'Visible from the street. And from the next street.' },
      { t: 'A small one of him', fx: { ego: 24, xp: 50 }, r: 'It lights up. It has a tiny tie. He stands under it for the photos.' },
    ] },
    newyearseve: { id: 'newyearseve', title: 'New Year’s Eve', text: 'The countdown is coming. He has asked to do it himself.', choices: [
      { t: 'Let him count', fx: { fun: 16, ego: 10, xp: 50 }, r: '“Ten! Nine! Seven!” Close enough. The year arrives anyway.' },
      { t: 'Start the fireworks early', fx: { fun: 14, xp: 50 }, r: '“Why wait? I’m here now.”' },
      { t: 'A toast with Diet Coke', fx: { food: 6, energy: 12, ego: 8, xp: 50 }, r: 'He clinks the can. “To the best year. I can already tell.”' },
    ] },
    friday13: { id: 'friday13', title: 'Friday the Thirteenth', text: 'It is an unlucky day. He does not believe in luck. He believes in himself.', choices: [
      { t: 'Walk under a ladder', fx: { ego: 14, fun: 8, xp: 50 }, r: 'Nothing happens. “See? Bad luck is afraid of me.”' },
      { t: 'Skip the thirteenth floor', fx: { ego: 10, xp: 50 }, r: 'His building already does. Which is how it got taller.' },
      { t: 'Pet the black cat', fx: { fun: 14, xp: 50 }, r: 'The cat sits on the briefing. It is the best-read briefing of the year.' },
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
    ['Every Meeting Begins With Applause', 'It also ends with applause.'],
    ['The Thermostat Belongs to Him', 'Nobody else touches the dial.'],
    ['Escalators Shall Not Stop', 'Especially halfway.'],
    ['Magnets Are Under Review', 'Nobody knows what they are.'],
    ['A Third Scoop, in Emergencies', 'He decides what counts as an emergency.'],
    ['Well Done Means Well Done', 'Chefs are advised not to argue.'],
    ['The National Fry Reserve', 'Salted. Strategically.'],
    ['Mirrors in All Elevators', 'For morale. His.'],
    ['The Tape May Stay on the Tie', 'It is structural.'],
    ['Executive Time Is Work', 'Nine hours of it.'],
    ['Eclipses Require His Approval', 'He looked. It was fine.'],
    ['Eagles Must Be Polite', 'Statues are exempt.'],
    ['Trucks May Be Honked', 'By him. For as long as he likes.'],
    ['One Time, All Year', 'The clocks are to leave him alone.'],
    ['The Penny Is Retired', 'Bigger coins are being considered.'],
    ['Flagpoles: Taller', 'Then taller than that.'],
    ['The Lawn Shall Be a Patio', 'One rose may stay.'],
    ['Capital Letters Are Encouraged', 'ESPECIALLY at night.'],
    ['Polls Must Ask the Right People', 'Starting with him.'],
    ['Name Tags for Visitors', 'His says “ME.”'],
    ['The Official Rally Song', 'The same one. Again.'],
    ['Checkups Are Graded by the Patient', 'Astonishingly excellent, every year.'],
    ['A Fragrance of National Importance', 'It smells like winning.'],
    ['Gold Hats Are Hats', 'Heavy is the head.'],
    ['Portraits Shall Be Flattering', 'Accuracy is not a defense.'],
    ['Naps Are Deep Listening', 'See also: blinking for a long time.'],
    ['The Fourth Dimension of Chess', 'Pawns may move sideways.'],
    ['Autographs on Everything', 'Including this order. Twice.'],
    ['Holidays Are About Him Too', 'In addition to whatever they were about.'],
    ['Groundhogs May Be Overruled', 'By Sharpie.'],
    ['Fun-Size Is Abolished', 'Full-size or nothing.'],
    ['Titles Must Be Bigger', 'And more beautiful.'],
    ['The Stapler Is Renamed', 'After him. It was the least it could do.'],
    ['Ovens Shall Run Hot', 'Medium rare is a rumor.'],
    ['Crosswords Accept His Answers', 'Write smaller if you have to.'],
    ['A Day Named After Him', 'It comes every four years, like clockwork.'],
    ['All Mondays Are Hereby Postponed', 'Until further notice. Probably Tuesday.'],
    ['The Thermostat Shall Read “Perfect”', 'Whatever the temperature.'],
    ['Pens Must Be Capped With Respect', 'Sharpies especially.'],
    ['A National Day of Applause', 'Clapping begins at nine. Sharp.'],
    ['Ketchup Is Hereby a Vegetable', 'Finally settled.'],
    ['The Word “Small” Is Retired', 'Use “pre-big”.'],
    ['Every Mirror Shall Be Slightly Flattering', 'Standards. They matter.'],
    ['Elevators Must Play His Greatest Hits', 'Up only.'],
    ['Naps Are Now “Executive Time”', 'Do not knock.'],
    ['Official Ruling: It Was a Perfect Call', 'Which call? All of them.'],
    ['The Second Scoop Is Protected by Law', 'For one person.'],
    ['All Ramps Shall Be Gentle', 'With handrails. Golden ones.'],
    // From here on, orders he can only sign once he is the thing they are about.
    ['Gold Is Hereby a Skin Tone', 'Natural. Very natural.', 55],
    ['Polishing Shall Occur Twice Daily', 'With the soft cloth.', 55],
    ['The Hair May Sign Documents', 'It has excellent penmanship.', 62],
    ['The Hair Shall Be Addressed as “Sir”', 'It prefers it.', 62],
    ['The Tie Is Granted Right of Way', 'At all crossings.', 70],
    ['No Stepping on the Tie', 'In any county it passes through.', 70],
    ['The City Shall Be Rearranged Around Him', 'Gently. He is standing in it.', 78],
    ['Clouds Must Go Around', 'Left or right. Not through.', 78],
    ['Rent Is Due to the Building Itself', 'He is the building. Pay him.', 86],
    ['Every Floor Is the Top Floor', 'Elevator buttons updated.', 86],
    ['The Other Planets Shall Orbit More Respectfully', 'And more quietly.', 93],
    ['One Day Is However Long He Says', 'Calendars are advised to keep up.', 93],
    ['His Moons Are to Be Named After Him', 'All of them. Numbered.', 93],
    ['The Universe Is Renamed', 'Guess.', 100],
    ['There Shall Be No Outside', 'It was not doing well anyway.', 100],
    ['Everything Is Hereby Tremendous', 'By definition. His.', 100],
  ].map(function (o, i) { const order = { id: i, no: 14000 + i * 7 + 1, title: o[0], note: o[1] }; if (o[2]) order.min = o[2]; return order; });

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
    { id: 'lv55', icon: '🥇', name: 'Gold Standard', desc: 'Reach level 55. He had himself plated.' },
    { id: 'lv62', icon: '👀', name: 'It Has Eyes', desc: 'Reach level 62. The hair is in charge.' },
    { id: 'lv70', icon: '👔', name: 'Loose End', desc: 'Reach level 70. The tie went all the way round.' },
    { id: 'lv78', icon: '🏙️', name: 'Too Big to Fit', desc: 'Reach level 78. He outgrew the office.' },
    { id: 'lv86', icon: '🏢', name: 'The Landlord', desc: 'Reach level 86. He is the building.' },
    { id: 'lv93', icon: '🪐', name: 'The Big Orange One', desc: 'Reach level 93. He is a planet.' },
    { id: 'lv100', icon: '🌌', name: 'Everything', desc: 'Reach level 100. There is only him.' },
    { id: 'term2', icon: '🗳️', name: 'Four More Years', desc: 'Start a second term.' },
    { id: 'term3', icon: '🗳️', name: 'Many People Are Saying It’s Allowed', desc: 'Start a third term.' },
    { id: 'turkey', icon: '🦃', name: 'Pardoned', desc: 'Pardon a Thanksgiving turkey.', secret: true },
    { id: 'season3', icon: '\uD83C\uDF89', name: 'Festive', desc: 'Take the special briefing on 3 different special days.' },
    { id: 'season10', icon: '\uD83D\uDCC5', name: 'Every Day Is a Holiday', desc: 'Take the special briefing on 10 different special days.' },
  ];

  // ---------------------------------------------------------------- seasons
  // What he says the first time you look in on a special day. Several, for days that last a while.
  C.SEASONS = {
    newyear: { name: 'New Year', greet: ['HAPPY NEW YEAR! It will be the best year. I already decided.', 'New year. Same me. Why change perfection?'] },
    inaug: { name: 'Inauguration Day', greet: ['Inauguration Day! The crowd was the biggest. You saw the pictures. Don’t look at the pictures.', 'This is the anniversary of a very big day. The biggest. Ask me about the crowd.'] },
    groundhog: { name: 'Groundhog Day', greet: ['Happy Groundhog Day. A rodent does the weather. I could do it better.', 'They trust a groundhog with the forecast. I have a Sharpie.'] },
    superbowl: { name: 'Big Game Sunday', greet: ['It’s the big game! I’d have gone pro. Everybody says so.', 'Game day. I already know who wins. Me, usually.'] },
    valentine: { name: 'Valentine’s Day', greet: ['Happy Valentine’s Day. I sent myself a card. Beautiful card.', 'Happy Valentine’s Day. I love you. And me. Mostly me.'] },
    presidents: { name: 'Presidents’ Day', greet: ['Presidents’ Day! A day about presidents. One in particular.', 'Happy Presidents’ Day. They made a holiday. I didn’t ask. But thank you.'] },
    leapday: { name: 'Leap Day', greet: ['An extra day! Somebody added a day. Probably for me.', 'February 29th. A bonus day of me. You’re welcome.'] },
    stpatrick: { name: 'St. Patrick’s Day', greet: ['Happy St. Patrick’s Day. Luck is nice. I have skill.', 'Green tie today. On me, even green looks expensive.'] },
    aprilfools: { name: 'April Fools’ Day', greet: ['It’s April Fools’. Nobody fools me. Nobody.', 'April first. I’ll be doing the pranking. I have the best pranks.'] },
    easter: { name: 'Easter', greet: ['Happy Easter! There’s an egg roll on the lawn. I’ll be supervising.', 'Happy Easter. I found all the eggs. I hid them, too. Great system.'] },
    hamburger: { name: 'Hamberder Day', greet: ['It’s NATIONAL HAMBERDER DAY! The most important holiday!', 'Today the whole country eats like me. Finally.'] },
    birthday: { name: 'His Birthday', greet: ['IT’S MY BIRTHDAY! Also some flag thing. But mostly my birthday!', 'Happy birthday to me. I’ve been told I don’t look a day over perfect.'] },
    july4: { name: 'The Fourth of July', greet: ['Happy Fourth! The fireworks are for the country. And a little for me.', 'Happy Fourth of July! I ordered extra fireworks. You can never have too many.'] },
    laborday: { name: 'Labor Day', greet: ['Happy Labor Day. Nobody works harder than me. I’m working right now. Look.', 'It’s Labor Day. I’ll be celebrating everyone’s hard work. Starting with mine.'] },
    halloween: { name: 'Halloween', greet: ['Happy Halloween. I’m going as myself. Scariest costume, they tell me.', 'Happy Halloween. I give out the full-size bars. I’m very popular.'] },
    turkey: { name: 'Thanksgiving', greet: ['Happy Thanksgiving! I’m thankful for me. And the turkey. Mostly me.', 'It’s turkey week. There’s one walking around the office. Very presidential bird.',
      'I’m thankful for many things. I made a list. I’m first on it.', 'Thanksgiving! Well-done turkey, ketchup on the side. Don’t make it weird.'] },
    blackfriday: { name: 'Black Friday', greet: ['Black Friday! Deals everywhere. I invented deals, practically.', 'Everything’s on sale today. Except me. I’m priceless.'] },
    christmas: { name: 'Christmas', greet: ['MERRY CHRISTMAS! We’re saying it again. I brought it back. You’re welcome!', 'It’s Christmastime. The tree is beautiful. I picked the tall one.',
      'Have you seen the lights? The best lights. I counted them. Many.', 'I made a list. I checked it once. That’s enough. It’s a great list.',
      'I asked for gold this year. Same as every year.', 'Ho ho ho. I’d be a great Santa. Better suit, though.'] },
    newyearseve: { name: 'New Year’s Eve', greet: ['New Year’s Eve! I’ll be doing the countdown. I’m very good with numbers.', 'Last day of the year. A tremendous year. The next one will be even better.'] },
    friday13: { name: 'Friday the 13th', greet: ['Friday the thirteenth. Unlucky for some. I don’t do unlucky.', 'They say today is bad luck. Bad luck has never met me.'] },
  };
  function easterSunday(y) { // the usual Gregorian reckoning
    const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
    const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
    return new Date(y, Math.floor((h + l - 7 * m + 114) / 31) - 1, ((h + l - 7 * m + 114) % 31) + 1);
  }
  // Which special day a date is, if any. Fixed dates win over movable ones when they collide.
  C.seasonFor = function (d) {
    const m = d.getMonth() + 1, day = d.getDate(), y = d.getFullYear();
    const nth = function (month, weekday, n) { // the n-th given weekday of a month (1-based month, 0 = Sunday)
      const first = new Date(y, month - 1, 1).getDay();
      return 1 + ((weekday - first + 7) % 7) + (n - 1) * 7;
    };
    if (m === 1 && day === 1) return 'newyear';
    if (m === 1 && day === 20) return 'inaug';
    if (m === 2 && day === 2) return 'groundhog';
    if (m === 2 && day === 14) return 'valentine';
    if (m === 2 && day === 29) return 'leapday';
    if (m === 2 && day === nth(2, 0, 2)) return 'superbowl';
    if (m === 2 && day === nth(2, 1, 3)) return 'presidents';
    if (m === 3 && day === 17) return 'stpatrick';
    if (m === 4 && day === 1) return 'aprilfools';
    const sinceEaster = Math.round((new Date(y, m - 1, day) - easterSunday(y)) / 864e5);
    if (sinceEaster === 0 || sinceEaster === 1) return 'easter'; // Sunday, and the egg roll on Monday
    if (m === 5 && day === 28) return 'hamburger';
    if (m === 6 && day === 14) return 'birthday';
    if (m === 7 && day === 4) return 'july4';
    if (m === 9 && day === nth(9, 1, 1)) return 'laborday';
    if (m === 10 && day === 31) return 'halloween';
    if (m === 11) {
      const thanksgiving = nth(11, 4, 4);
      if (day >= thanksgiving - 6 && day <= thanksgiving) return 'turkey';
      if (day === thanksgiving + 1) return 'blackfriday';
    }
    if (m === 12 && day <= 26) return 'christmas';
    if (m === 12 && day === 31) return 'newyearseve';
    if (day === 13 && d.getDay() === 5) return 'friday13';
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
    'He alphabetized the Sharpies. All of them are under “S.”',
    'He practiced the handshake on a doorknob.',
    'He called the front desk to ask how he was doing.',
    'He rated the furniture. The chair got a seven.',
    'He stood very still to see if anyone would clap.',
    'He gave a speech to an empty room. It went great.',
    'He challenged the thermostat and lost.',
    'He moved the trophy two inches to the left, then back.',
    'He drafted {n} posts and showed remarkable restraint by posting only some.',
    'He pressed the button for {n} Diet Cokes and drank most of them.',
    'He checked the window for crowds {n} times.',
    'He autographed the briefing instead of reading it.',
    'He practiced looking at a camera.',
    'He named {n} things “the best.”',
    'He tried to make a deal with the vending machine.',
    'He watched the door. The door did not open.',
    'He told the desk a story it had heard before.',
    'He measured the tie. Still the longest.',
    'He won {n} imaginary arguments.',
    'He took a nap and described it afterward as a meeting.',
  ];

  C.DEAL_BUYERS = ['A Guy From Queens', 'A Very Rich Friend', 'The Hotel People', 'A Mysterious Prince', 'Some Golf Guys', 'A Casino Enthusiast', 'The Steak Consortium', 'A Man With A Briefcase',
    'A Golf Cart Dealer', 'The Chandelier People', 'A Reality TV Producer', 'Some Guy With a Boat', 'The Ketchup Lobby', 'A Friend of a Friend', 'A Very Tall Lawyer', 'The Mattress King'];
  C.DEAL_ITEMS = ['naming rights to a tower', 'a slightly used golf course', 'a line of extra-long ties', 'a very luxurious steak brand', 'gold sneakers', 'a signed Sharpie', 'the penthouse (not the good one)', 'a board game about himself',
    'a gold-plated golf cart', 'the second-best chandelier', 'a bottle of his cologne', 'a box of superhero trading cards', 'a flagpole (tall)', 'a hat that is too heavy to wear', 'the film rights to a handshake',
    'a steak, well done', 'one square foot of the lobby', 'a commemorative coin the size of a plate', 'a signed photo of a signature', 'a slightly smaller tower'];

  // ---------------------------------------------------------------- the news ticker
  // Headlines under the screen: what he needs right now, and how the world sees him at each register.
  C.NEWS = {
    want: {
      hungry: ['Sources: he has not eaten in minutes. Possibly hours.', 'Kitchen on high alert as hamberder reserves go untouched.', 'Stomach heard from across the office. Witnesses shaken.'],
      needEgo: ['Developing: nobody has complimented him recently.', 'Applause shortage enters its second hour.', 'Experts warn of “dangerously low” flattery levels.'],
      bored: ['Alert: boredom rising. Golf is recommended.', 'He has begun staring at the putter. Analysts concerned.', 'Entertainment gap widens. Rally urged.'],
      needGlow: ['Hair altitude dropping. Experts concerned.', 'Bronzer reserves untapped as glow fades.', 'Swoop reported “listing to one side.”'],
      tired: ['He insists he is not tired. He is tired.', 'Yawn described by aides as “a power breath.”', 'Eyes closed “for strategic reasons,” office says.'],
    },
    tier: [
      ['Local man described as “pleasant, quiet.”', 'Area man holds door, apologizes to door.', 'Neighbor: “Honestly? Very normal guy.”', 'Man returns shopping cart, declines to be thanked.',
        'Resident describes own tie as “probably fine.”', 'Man waits his turn, enjoys it.', 'Witness: “He asked how MY day was.”', 'Quiet fellow seen reading instructions before starting.'],
      ['Queens kid reports having “a feeling” about himself.', 'Young man seen looking at tall buildings, nodding.', 'Man buys second suit, feels “on the way up.”', 'Queens resident practices signature “just in case.”',
        'Local man begins sentences with “Frankly.”', 'Neighbor notices firm handshake, “didn’t hate it.”', 'Young man asks how much the tall building costs.', 'Area man tips well, mentions it.'],
      ['Developer puts name on building, then on the sign pointing at the building.', 'Mogul describes own lunch as “historic.”', 'Mogul names sandwich after himself, orders it.', 'Developer adds floor to building using label maker.',
        'Businessman rates own handshake “a ten.”', 'Tower lobby gets fourth chandelier “for balance.”', 'Man in long tie calls shorter ties “a phase.”', 'Mogul says humility is his best quality, “by far.”'],
      ['Candidate rates own speech “a ten, maybe an eleven.”', 'Rally crowd estimated at “everyone.”', 'Candidate promises “so much winning,” no further details.', 'Escalator ride described by rider as “historic.”',
        'Candidate polls himself, wins in a landslide.', 'Red hats sell out; candidate signs the empty box.', 'Rally runs long after candidate applauds own speech.', 'Opponent, a teleprompter, declines to debate.'],
      ['President declares today “the greatest day,” same as yesterday.', 'Mountain reportedly “being measured.”', 'Sharpie stock soars on signing rumors.', 'President signs order requiring this headline.',
        'The mountain “has room on the left,” source says.', 'Weather map corrected by hand; forecast now “perfect.”', 'President awards himself prize, gives moving speech.', 'Nation’s Sharpie reserves at “strategic low.”'],
      ['Scientists confirm: “It’s still getting bigger.”', 'Astronomers rename sky after him “to save time.”', 'Map makers give up, write “HIM” across everything.', 'Gravity issues statement: “We’re working with him.”',
        'Experts say he is visible from space. Space confirms.', 'New unit of size announced: one “Don”.', 'Local man “remembers when he was just a president.”', 'Weather today: him, with a chance of more.'],
    ],
  };
})(typeof window !== 'undefined' ? window : globalThis);
