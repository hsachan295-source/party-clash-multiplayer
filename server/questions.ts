// Server-only question bank. This file is never imported by the browser
// bundle, so correct answers cannot leak to players ahead of time.
// `a` is the index of the correct option in `o`.

export interface BankQuestion {
  c: string;
  q: string;
  o: [string, string, string, string];
  a: number;
}

export const QUESTIONS: BankQuestion[] = [
  // Science
  { c: "Science", q: "What gas do plants absorb from the air for photosynthesis?", o: ["Oxygen", "Carbon dioxide", "Nitrogen", "Helium"], a: 1 },
  { c: "Science", q: "What is the chemical symbol for gold?", o: ["Gd", "Go", "Au", "Ag"], a: 2 },
  { c: "Science", q: "How many bones are in the adult human body?", o: ["186", "206", "226", "256"], a: 1 },
  { c: "Science", q: "Which planet is known as the Red Planet?", o: ["Venus", "Jupiter", "Mars", "Mercury"], a: 2 },
  { c: "Science", q: "What is the hardest natural substance?", o: ["Diamond", "Quartz", "Granite", "Titanium"], a: 0 },
  { c: "Science", q: "At sea level, water boils at what temperature in Celsius?", o: ["90°C", "100°C", "110°C", "120°C"], a: 1 },
  { c: "Science", q: "Which organ pumps blood around the human body?", o: ["Liver", "Lungs", "Kidney", "Heart"], a: 3 },
  { c: "Science", q: "What is the largest planet in our solar system?", o: ["Saturn", "Jupiter", "Neptune", "Earth"], a: 1 },
  { c: "Science", q: "What part of the cell contains most of its DNA?", o: ["Nucleus", "Membrane", "Ribosome", "Cytoplasm"], a: 0 },
  { c: "Science", q: "Which element has the chemical symbol O?", o: ["Osmium", "Gold", "Oxygen", "Oganesson"], a: 2 },
  { c: "Science", q: "Roughly how long does sunlight take to reach Earth?", o: ["8 seconds", "8 minutes", "8 hours", "8 days"], a: 1 },
  { c: "Science", q: "What force keeps the planets in orbit around the Sun?", o: ["Magnetism", "Friction", "Gravity", "Electricity"], a: 2 },
  // Geography
  { c: "Geography", q: "What is the capital of Japan?", o: ["Osaka", "Kyoto", "Tokyo", "Seoul"], a: 2 },
  { c: "Geography", q: "Which is the largest ocean on Earth?", o: ["Atlantic", "Indian", "Arctic", "Pacific"], a: 3 },
  { c: "Geography", q: "Which country has the largest land area?", o: ["Canada", "China", "Russia", "USA"], a: 2 },
  { c: "Geography", q: "What is the capital of Australia?", o: ["Sydney", "Canberra", "Melbourne", "Perth"], a: 1 },
  { c: "Geography", q: "Which river flows through Egypt?", o: ["Amazon", "Nile", "Danube", "Ganges"], a: 1 },
  { c: "Geography", q: "Mount Everest sits on the border of Nepal and which other country?", o: ["India", "Bhutan", "China", "Pakistan"], a: 2 },
  { c: "Geography", q: "Which continent is the Sahara Desert on?", o: ["Asia", "Africa", "Australia", "South America"], a: 1 },
  { c: "Geography", q: "What is the capital of Canada?", o: ["Toronto", "Vancouver", "Montreal", "Ottawa"], a: 3 },
  { c: "Geography", q: "How many continents are there?", o: ["5", "6", "7", "8"], a: 2 },
  { c: "Geography", q: "Which country is shaped like a boot?", o: ["Italy", "Greece", "Portugal", "Chile"], a: 0 },
  { c: "Geography", q: "What is the smallest country in the world by area?", o: ["Monaco", "Vatican City", "San Marino", "Malta"], a: 1 },
  { c: "Geography", q: "Which city is known as the Big Apple?", o: ["Chicago", "Los Angeles", "New York City", "Boston"], a: 2 },
  // History
  { c: "History", q: "In which year did humans first land on the Moon?", o: ["1965", "1969", "1972", "1959"], a: 1 },
  { c: "History", q: "Who was the first President of the United States?", o: ["Abraham Lincoln", "Thomas Jefferson", "George Washington", "John Adams"], a: 2 },
  { c: "History", q: "Which ancient civilisation built the pyramids at Giza?", o: ["Romans", "Egyptians", "Greeks", "Aztecs"], a: 1 },
  { c: "History", q: "The Titanic sank in which year?", o: ["1912", "1905", "1920", "1898"], a: 0 },
  { c: "History", q: "Which wall fell in 1989?", o: ["Great Wall", "Hadrian's Wall", "Berlin Wall", "Western Wall"], a: 2 },
  { c: "History", q: "Who painted the Mona Lisa?", o: ["Michelangelo", "Leonardo da Vinci", "Raphael", "Van Gogh"], a: 1 },
  { c: "History", q: "Which empire was ruled by Julius Caesar?", o: ["Roman", "Ottoman", "Persian", "Mongol"], a: 0 },
  { c: "History", q: "Who was the first person to walk on the Moon?", o: ["Buzz Aldrin", "Yuri Gagarin", "Neil Armstrong", "John Glenn"], a: 2 },
  { c: "History", q: "In which country did the Olympic Games originate?", o: ["Italy", "Greece", "Egypt", "France"], a: 1 },
  { c: "History", q: "World War II ended in which year?", o: ["1943", "1945", "1947", "1950"], a: 1 },
  // Pop culture & entertainment
  { c: "Pop Culture", q: "What is the name of the wizarding school in Harry Potter?", o: ["Durmstrang", "Hogwarts", "Beauxbatons", "Ilvermorny"], a: 1 },
  { c: "Pop Culture", q: "Which animated film features the song \"Let It Go\"?", o: ["Moana", "Tangled", "Frozen", "Encanto"], a: 2 },
  { c: "Pop Culture", q: "What colour is Pac-Man?", o: ["Yellow", "Red", "Blue", "Green"], a: 0 },
  { c: "Pop Culture", q: "Which superhero is known as the Dark Knight?", o: ["Superman", "Batman", "Iron Man", "Spider-Man"], a: 1 },
  { c: "Pop Culture", q: "Mario's brother in Nintendo games is called…", o: ["Wario", "Luigi", "Toad", "Yoshi"], a: 1 },
  { c: "Pop Culture", q: "In Toy Story, what is the name of the cowboy?", o: ["Buzz", "Jessie", "Woody", "Rex"], a: 2 },
  { c: "Pop Culture", q: "Which band sang \"Hey Jude\"?", o: ["The Rolling Stones", "Queen", "The Beatles", "ABBA"], a: 2 },
  { c: "Pop Culture", q: "What is the name of the fictional African country in Black Panther?", o: ["Zamunda", "Wakanda", "Genovia", "Sokovia"], a: 1 },
  { c: "Pop Culture", q: "Which video game features Master Chief?", o: ["Halo", "Doom", "Call of Duty", "Destiny"], a: 0 },
  { c: "Pop Culture", q: "In the game Minecraft, what explodes when it gets close to you?", o: ["Zombie", "Skeleton", "Creeper", "Enderman"], a: 2 },
  { c: "Pop Culture", q: "What is Shrek?", o: ["A troll", "An ogre", "A giant", "A goblin"], a: 1 },
  { c: "Pop Culture", q: "Which streaming show features the Upside Down?", o: ["Dark", "Stranger Things", "The OA", "Wednesday"], a: 1 },
  // Nature & animals
  { c: "Animals", q: "What is the fastest land animal?", o: ["Lion", "Cheetah", "Horse", "Greyhound"], a: 1 },
  { c: "Animals", q: "How many legs does a spider have?", o: ["6", "8", "10", "12"], a: 1 },
  { c: "Animals", q: "What is the largest animal ever known to have lived?", o: ["African elephant", "Megalodon", "Blue whale", "T. rex"], a: 2 },
  { c: "Animals", q: "A group of lions is called a…", o: ["Pack", "Herd", "Pride", "School"], a: 2 },
  { c: "Animals", q: "Which bird is a universal symbol of peace?", o: ["Eagle", "Dove", "Owl", "Swan"], a: 1 },
  { c: "Animals", q: "What do pandas mostly eat?", o: ["Fish", "Bamboo", "Berries", "Insects"], a: 1 },
  { c: "Animals", q: "Which mammal can truly fly?", o: ["Flying squirrel", "Bat", "Sugar glider", "Lemur"], a: 1 },
  { c: "Animals", q: "How many hearts does an octopus have?", o: ["1", "2", "3", "4"], a: 2 },
  { c: "Animals", q: "What is a baby kangaroo called?", o: ["Cub", "Kit", "Joey", "Calf"], a: 2 },
  { c: "Animals", q: "Which animal is known as the 'ship of the desert'?", o: ["Horse", "Camel", "Elephant", "Donkey"], a: 1 },
  // Food
  { c: "Food", q: "Guacamole is mainly made from which fruit?", o: ["Avocado", "Lime", "Tomato", "Mango"], a: 0 },
  { c: "Food", q: "Which country is the origin of sushi?", o: ["China", "Korea", "Japan", "Thailand"], a: 2 },
  { c: "Food", q: "What is the main ingredient in hummus?", o: ["Lentils", "Chickpeas", "Black beans", "Peas"], a: 1 },
  { c: "Food", q: "Which nut is used to make marzipan?", o: ["Peanut", "Cashew", "Almond", "Walnut"], a: 2 },
  { c: "Food", q: "What type of pasta is shaped like little bow ties?", o: ["Penne", "Farfalle", "Fusilli", "Rigatoni"], a: 1 },
  { c: "Food", q: "Which spice gives curry its yellow colour?", o: ["Paprika", "Cumin", "Turmeric", "Saffron"], a: 2 },
  { c: "Food", q: "What is the main ingredient of a traditional omelette?", o: ["Flour", "Eggs", "Milk", "Cheese"], a: 1 },
  { c: "Food", q: "Which fruit has its seeds on the outside?", o: ["Strawberry", "Kiwi", "Banana", "Grape"], a: 0 },
  // Sports
  { c: "Sports", q: "How many players does a football (soccer) team have on the pitch?", o: ["9", "10", "11", "12"], a: 2 },
  { c: "Sports", q: "In which sport would you perform a slam dunk?", o: ["Volleyball", "Basketball", "Tennis", "Rugby"], a: 1 },
  { c: "Sports", q: "How many rings are on the Olympic flag?", o: ["4", "5", "6", "7"], a: 1 },
  { c: "Sports", q: "Which sport is played at Wimbledon?", o: ["Golf", "Cricket", "Tennis", "Polo"], a: 2 },
  { c: "Sports", q: "In bowling, what is it called when you knock down all pins on the first throw?", o: ["Spare", "Strike", "Split", "Turkey"], a: 1 },
  { c: "Sports", q: "How many points is a touchdown worth in American football?", o: ["3", "6", "7", "2"], a: 1 },
  { c: "Sports", q: "Which country has won the most FIFA World Cups?", o: ["Germany", "Italy", "Argentina", "Brazil"], a: 3 },
  { c: "Sports", q: "In chess, which piece can only move diagonally?", o: ["Rook", "Knight", "Bishop", "King"], a: 2 },
  // Tech & words
  { c: "Tech", q: "What does \"CPU\" stand for?", o: ["Central Processing Unit", "Computer Power Unit", "Core Program Utility", "Central Print Unit"], a: 0 },
  { c: "Tech", q: "Which company makes the iPhone?", o: ["Samsung", "Google", "Apple", "Sony"], a: 2 },
  { c: "Tech", q: "What does \"www\" stand for in a web address?", o: ["World Wide Web", "Web World Wide", "Wide Web World", "World Web Wire"], a: 0 },
  { c: "Tech", q: "How many bits are in a byte?", o: ["4", "8", "16", "32"], a: 1 },
  { c: "Tech", q: "Which key combination usually copies text on Windows?", o: ["Ctrl + V", "Ctrl + X", "Ctrl + C", "Ctrl + Z"], a: 2 },
  { c: "Words", q: "Which word is a synonym of \"happy\"?", o: ["Gloomy", "Joyful", "Weary", "Anxious"], a: 1 },
  { c: "Words", q: "How many letters are in the English alphabet?", o: ["24", "25", "26", "27"], a: 2 },
  { c: "Words", q: "What is the plural of \"mouse\" (the animal)?", o: ["Mouses", "Mice", "Meese", "Mousen"], a: 1 },
  { c: "Words", q: "Which of these is a palindrome?", o: ["Rotor", "Motor", "Meter", "Rotate"], a: 0 },
  // Math
  { c: "Math", q: "What is 7 × 8?", o: ["54", "56", "58", "64"], a: 1 },
  { c: "Math", q: "How many sides does a hexagon have?", o: ["5", "6", "7", "8"], a: 1 },
  { c: "Math", q: "What is the square root of 81?", o: ["7", "8", "9", "10"], a: 2 },
  { c: "Math", q: "What is 15% of 200?", o: ["15", "20", "30", "35"], a: 2 },
  { c: "Math", q: "How many degrees are in a right angle?", o: ["45°", "90°", "180°", "360°"], a: 1 },
  { c: "Math", q: "What is the next prime number after 7?", o: ["9", "10", "11", "13"], a: 2 },
  { c: "Math", q: "How many minutes are in 3 hours?", o: ["120", "160", "180", "240"], a: 2 },
];
