import { WebSocketServer } from "ws";
import { readFileSync, writeFileSync, createWriteStream, openSync } from "node:fs";

const wss = new WebSocketServer({ port: 6969 });

wss.on("connection", function connection(ws){
    ws.on("message", function m(data){
        var response = message(data, ws);
        
        if (response !== null && response != "") ws.send(JSON.stringify(response));
    });
});

function initialize(){
    loadData();

    MapData = JSON.parse(readFileSync("./data/maps/" + Metadata.map + ".json"));

    setInterval(update, 10000);
}

function announce(msg){
    wss.clients.forEach(function each(client){
        if (client.readyState === WebSocket.OPEN){
            client.send(msg);
        }
    });
}

function message(data, ws){
    data = JSON.parse(data);

    console.log(data);

    if (data.method == null) return { error: "could not find method" };

    switch (data.method){
        case "get_status":
            return get_status(data);
        case "register":
            return register(data);
        case "sign_in":
            return sign_in(data);
        case "check_in":
            return check_in(data);
        case "end_turn":
            return end_turn(data);
        case "confirm_mod":
            return confirm_mod(data);
        case "submit_results":
            return submit_results(data);
        case "get_lobby":
            return get_lobby(data, ws);
        case "get_player_data":
            return get_player_data(data);
        case "send_message":
            send_message(data);
            return null;
    }

    return { error: "could not find method" };
}

function set_metadata(data){
    //REMOVE FUNCTION LATER
    if (Object.hasOwn(data, "turn")) Metadata.turn = data.turn;
    if (Object.hasOwn(data, "gameLength")) Metadata.gameLength = data.gameLength;
    if (Object.hasOwn(data, "status")) Metadata.status = data.status;
    if (Object.hasOwn(data, "startTime")) Metadata.startTime = data.startTime;
    if (Object.hasOwn(data, "checkInLength")) Metadata.checkInLength = data.checkInLength;

    saveData();
}

var Metadata;
var Players = {};
var MinigameLobbies = [];
var Minigames = JSON.parse(readFileSync("./data/minigames.json"));
var PlayedMinigames = [];
var MapData;

function get_status(data){
    if ((Metadata.status == "TURN" || Metadata.status == "MINIGAME") && Object.hasOwn(data, "token") && Object.hasOwn(Players, data.token) && Players[data.token].checkedIn){
        return { method: data.method, status: Metadata.status, turn: Metadata.turn, 
            data: { coins: Players[data.token].coins, stars: Players[data.token].stars, turnsCompleted: Players[data.token].turnsCompleted, items: Players[data.token].items, position: Players[data.token].position, collectedSilverStars: Players[data.token].collectedSilverStars },
            silverStars: Metadata.silverStars
        };
    }
    else if (Metadata.status == "RESULTS"){
        var publicPlayerData = [];
        for (const [key, value] of Object.entries(Players)) {
            if (value.checkedIn) publicPlayerData.push({ ign: value.ign, coins: value.coins, stars: value.stars });
        }
        return { method: data.method, status: Metadata.status, data: publicPlayerData };
    }
    else{
        return { method: data.method, status: Metadata.status };
    }
}

function get_player_data(data){
    if (Object.hasOwn(Players, data.token)){
        return { method: data.method, data: Players[data.token] };
    }
}

function generateLoginToken(){
    let rng = Math.random();
    let token = "";

    while (token == ""){
        if (rng > 0.66666){
            //Main Weapon Based
            const column1 = ["Buff", "Nerf", "Fix", "Patch", "Give", "Remove"];
            const column2 = ["Stamper", "Slosher", "RangeBlaster", "Shot", "Splash", "H3", "Squeezer", "Carbon", "Squiffer", "Pencil", "GooTuber", "Explosher", "Clash", "Machine", "Tent", "Brella", "Undercover", "Wiper", "Decav", "Charger", "Eliter", "BigSwig", "Blob", "Reeflux", "Wellstring", "Dapples", "Dualies", "Inkbrush", "Painbrush", "Dread"];
            const column3 = ["ObjectDamage", "FireRate", "Damage", "SpecialCost", "EndLag", "Startup", "Paint", "Hitbox", "Range"];
    
            token += column1[Math.floor(Math.random() * column1.length)];
            token += column2[Math.floor(Math.random() * column2.length)];
            token += column3[Math.floor(Math.random() * column3.length)];
        }
        else if (rng > 0.33333){
            //Special Based
            const column1 = ["Buff", "Nerf", "Fix", "Patch", "Give", "Remove"];
            const column2 = ["Missiles", "InkVac", "Zipcaster", "Crab", "Zooka", "BooyahBomb", "Inkjet", "Reefslider", "Splashdown", "Chumps", "Kraken", "Wail", "Bubble", "InkStorm", "Screen", "Stamp", "WaveBreaker", "Strikes"];
            const column3 = ["Spam", "Hitbox", "Startup", "SpecialCost", "Paint", "Explosion", "Radius", "Range"];
    
            token += column1[Math.floor(Math.random() * column1.length)];
            token += column2[Math.floor(Math.random() * column2.length)];
            token += column3[Math.floor(Math.random() * column3.length)];
        }
        else{
            //Sub Based
            const column1 = ["Buff", "Nerf", "Fix", "Patch", "Give", "Remove"];
            const column2 = ["LineMarker", "FizzyBomb", "SplatBomb", "SuctionBomb", "BurstBomb", "Sprinkler", "CurlingBomb", "Autobomb", "InkMine", "ToxicMist", "SplashWall", "SquidBeakon", "Torpedo"];
            const column3 = ["Spam", "Hitbox", "Startup", "SpecialCost", "Paint", "Radius", "Range", "Damage"];
    
            token += column1[Math.floor(Math.random() * column1.length)];
            token += column2[Math.floor(Math.random() * column2.length)];
            token += column3[Math.floor(Math.random() * column3.length)];
        }
    
        //Check if token is available
        if (Object.hasOwn(Players, token)) token = "";
    }

    return token;
}

function generateRoomPassword(){
  const numpad = 
  [
    [1, 2, 3],
    [4, 5, 6],
    [7, 8, 9],
    [-1, 0, -1]
  ];
  const directions = [
    {x: 0, y: 0},
    {x: 1, y: 0},
    {x: 0, y: 1},
    {x: -1, y: 0},
    {x: 0, y: -1},
  ];

  let currentDigit = {x: 1, y: 1};
  let password = "5";

  for (var i = 0; i < 3; i++){
    while(true){
      var testDirection = directions[Math.floor(Math.random() * directions.length)];
      var testDigit = {x: currentDigit.x + testDirection.x, y: currentDigit.y + testDirection.y};
      
      if (!(testDigit.x < 0 || testDigit.x > 2 || testDigit.y < 0 || testDigit.y > 3 || numpad[testDigit.y][testDigit.x] == -1)){
        currentDigit = testDigit;
        break;
      }
    }
    password += numpad[currentDigit.y][currentDigit.x];
  }

  return password;
}

function generateRoomPool(){
    return "MSP" + Math.floor(Math.random() * 3);
}

function register(data){
    for (const [key, value] of Object.entries(Players)) {
        if (value.discord == data.discord && value.ign == data.ign){
            return { method: data.method, success: true, token: key, startTime: Metadata.startTime };
        }
        else if (value.discord == data.discord || value.ign == data.ign){
            return { method: data.method, success: false, error: "could not register player" };
        }
    }

    let token = generateLoginToken();
    
    Object.defineProperty(Players, token, {writable: true, enumerable: true, value: { discord: data.discord, ign: data.ign, checkedIn: false, coins: 10, stars: 0, position: {x: 15, y: 30}, collectedSilverStars: [], items: ["doubledice"], turnsCompleted: 0, modFlag: false }});
    saveData();

    console.log("Registered Player: " + data.discord + ", " + data.ign);
    
    return { method: data.method, success: true, token: token, startTime: Metadata.startTime };
    //MAYBE ADD DISCORD INTEGRATION TO THIS SERVER
}

function sign_in(data){
    if (Object.hasOwn(Players, data.token)){
        return { method: data.method, success: true, startTime: Metadata.startTime, checkedIn: Players[data.token].checkedIn };
    }
    else{
        return { method: data.method, success: false, error: "could not find player" };
    }
}

function check_in(data){
    if (Metadata.status == "CHECK_IN"){
        if (Object.hasOwn(Players, data.token)){
            Players[data.token].checkedIn = true;
            saveData();
            return { method: data.method, success: true };
        }
        else{
            return { method: data.method, success: false, error: "could not find player" };
        }
    }
}

function arraysEqual(a, b){
    if (a === b) return true;
    if (a == null || b == null) return false;
    if (a.length !== b.length) return false;

    for (var i = 0; i < a.length; i++){
        if (a[i] !== b[i]) return false;
    }

    return true;
}

function end_turn(data){
    if (Metadata.status != "TURN") return { method: data.method, success: false, error: "turn is not active" };
    if (Object.hasOwn(Players, data.token) && Players[data.token].checkedIn){
        if (Players[data.token].modFlag){
            //Moderator made a change
            if (Players[data.token].position.x == data.position.x && Players[data.token].position.y == data.position.y && Players[data.token].coins == data.coins && Players[data.token].stars == data.stars && arraysEqual(Players[data.token].items, data.items) && Players[data.token].turnsCompleted == data.turnsCompleted && arraysEqual(Players[data.token].collectedSilverStars, data.collectedSilverStars)){
                Players[data.token].modFlag = false;
                return { method: data.method, success: true };
            }
            else{
                return { method: data.method, success: false, data: { position: Players[data.token].position, coins: Players[data.token].coins, stars: Players[data.token].stars, items: Players[data.token].items, turnsCompleted: Players[data.token].turnsCompleted, collectedSilverStars: Players[data.token].collectedSilverStars } };
            }
        }
        else{
            //Good to go
            console.log(Players[data.token].ign + " finished their turn");

            Players[data.token].position = data.position;
            Players[data.token].coins = data.coins;
            Players[data.token].stars = data.stars;
            Players[data.token].items = data.items;
            Players[data.token].turnsCompleted = Metadata.turn;
            Players[data.token].collectedSilverStars = data.collectedSilverStars;

            saveData();
            checkMinigameStart();

            return { method: data.method, success: true };
        }
    }
}

function confirm_mod(data){
    if (Object.hasOwn(Players, data.token) && Players[data.token].checkedIn){
        if (Players[data.token].modFlag){
            if (Players[data.token].position.x == data.position.x && Players[data.token].position.y == data.position.y && Players[data.token].coins == data.coins && Players[data.token].stars == data.stars && arraysEqual(Players[data.token].items, data.items) && Players[data.token].turnsCompleted == data.turnsCompleted){
                Players[data.token].modFlag = false;
                saveData();
                return { method: data.method, success: true };
            }
            else{
                return { method: data.method, success: false, error: "data does not match", data: { position: Players[data.token].position, coins: Players[data.token].coins, stars: Players[data.token].stars, items: Players[data.token].items, turnsCompleted: Players[data.token].turnsCompleted } };
            }
        }
        else{
            return { method: data.method, success: true };
        }
    }
}

function checkMinigameStart(){
    var checkedInPlayers = [];

    for (const [key, value] of Object.entries(Players)) {
        if (value.checkedIn){
            checkedInPlayers.push(key);
            if (value.turnsCompleted != Metadata.turn){
                return;
            }
        }
    }

    //START MINIGAME!!!
    console.log("MINIGAME HAS STARTED!!!");
    MinigameLobbies = [];
    //Get an unplayed minigame (Now uses the weighted system)
    var minigame = "";
    var minigamePool = [];
    var minigamePoolTotal = 0;
    for (const [key, value] of Object.entries(Minigames)){
        if (!Object.hasOwn(value, "hidden") && !PlayedMinigames.includes(key)){
            minigamePool.push({ minigame: key, weight: value.weight });
            minigamePoolTotal += value.weight;
        }
    }
    var randomValue = Math.random() * minigamePoolTotal;
    minigamePoolTotal = 0;
    for (var i = 0; i < minigamePool.length; i++){
        minigamePoolTotal += minigamePool[i].weight;
        if (minigamePoolTotal >= randomValue){
            minigame = minigamePool[i].minigame;
            break;
        }
    }

    PlayedMinigames.push(minigame);

    //Sort checked in players by ranking (Sort backwards if a coop minigame so top players get smaller lobbies)
    for (var i = 0; i < checkedInPlayers.length - 1; i++){
        for (var j = 0; j < checkedInPlayers.length - i - 1; j++){
            if (Minigames[minigame].type == "coop"){
                //Reverse Sort
                if (Players[checkedInPlayers[j+1]].stars > Players[checkedInPlayers[j]].stars || (Players[checkedInPlayers[j+1]].stars == Players[checkedInPlayers[j]].stars && Players[checkedInPlayers[j+1]].coins > Players[checkedInPlayers[j]].coins) || (Players[checkedInPlayers[j+1]].stars == Players[checkedInPlayers[j]].stars && Players[checkedInPlayers[j+1]].coins == Players[checkedInPlayers[j]].coins && Math.random() > 0.5)){
                    var temp = checkedInPlayers[j];
                    checkedInPlayers[j] = checkedInPlayers[j+1];
                    checkedInPlayers[j+1] = temp;
                }
            }
            else{
                //Normal Sort
                if (Players[checkedInPlayers[j+1]].stars < Players[checkedInPlayers[j]].stars || (Players[checkedInPlayers[j+1]].stars == Players[checkedInPlayers[j]].stars && Players[checkedInPlayers[j+1]].coins < Players[checkedInPlayers[j]].coins) || (Players[checkedInPlayers[j+1]].stars == Players[checkedInPlayers[j]].stars && Players[checkedInPlayers[j+1]].coins == Players[checkedInPlayers[j]].coins && Math.random() > 0.5)){
                    var temp = checkedInPlayers[j];
                    checkedInPlayers[j] = checkedInPlayers[j+1];
                    checkedInPlayers[j+1] = temp;
                }
            }
        }
    }

    //New Lobby System
    var numLobbies = Math.ceil(checkedInPlayers.length / Minigames[minigame].lobbySize);
    var lastLobbySize = checkedInPlayers.length % numLobbies;
    var lastLobbyPlacement = Math.floor(Math.random() * numLobbies);

    var currentPlacement = 0;
    for (var i = 0; i < numLobbies; i++){
        var players = [];
        for (var j = 0; j < Minigames[minigame].lobbySize; j++){
            players.push(checkedInPlayers[currentPlacement]);
            currentPlacement++;

            if (lastLobbySize > 0 && i == lastLobbyPlacement && j == lastLobbySize - 1) break;
            if (currentPlacement == checkedInPlayers.length) break;
        }

        if (lastLobbySize > 0 && i == lastLobbyPlacement){
            if (lastLobbySize == 1){
                MinigameLobbies.push({ minigame: (["goldeneggssolo", "anarchysolo", "killssolo", "speedrunsolo"])[Math.floor(Math.random() * 4)], players: players, pool: generateRoomPool(), pass: generateRoomPassword(), result: [], scoreConfirm: false, chatHistory: [] });
            }
            else if ((lastLobbySize % 2 == 1 && Minigames[minigame].evenSize) || (lastLobbySize < Minigames[minigame].minLobbySize)){
                MinigameLobbies.push({ minigame: (["speedrun1extra", "speedrun2extra", "speedrun3extra"])[Math.floor(Math.random() * 3)], players: players, pool: generateRoomPool(), pass: generateRoomPassword(), result: [], scoreConfirm: false, chatHistory: [] });
            }
            else{
                MinigameLobbies.push({ minigame: minigame, players: players, pool: generateRoomPool(), pass: generateRoomPassword(), result: [], scoreConfirm: false, chatHistory: [] });
            }
        }
        else{
            MinigameLobbies.push({ minigame: minigame, players: players, pool: generateRoomPool(), pass: generateRoomPassword(), result: [], scoreConfirm: false, chatHistory: [] });
        }
    }
    
    Metadata.status = "MINIGAME";

    GenerateMinigameChatroomValues();

    saveData();

    announce(JSON.stringify({ method: "announcement", status: "MINIGAME" }));

    //GIVE OUT EACH PLAYER THEIR LOBBY HERE
    //DON'T GIVE OUT PLAYER IDS
    //Note: Changed this out for players requesting their lobby instead
    /*wss.clients.forEach(function each(client){
        if (client.readyState === WebSocket.OPEN && Object.hasOwn(client, "token")){
            for (var i = 0; i < MinigameLobbies.length; i++){
                if (MinigameLobbies[i].players.includes(client.token)){
                    var lobbyMsg = [];
                    for (var j = 0; j < MinigameLobbies[i].players.length; j++){
                        lobbyMsg.push({ discord: Players[MinigameLobbies[i].players[j]].discord, ign: Players[MinigameLobbies[i].players[j]].ign });
                    }
                    client.send(JSON.stringify({ method: "announcement", status: "MINIGAME", lobby: lobbyMsg, minigame: MinigameLobbies[i].minigame, pool: MinigameLobbies[i].pool, pass: MinigameLobbies[i].pass }));
                    break;
                }
            }
        }
    });*/
}

function GenerateMinigameChatroomValues(){
    if (MinigameLobbies.length == 0) return;
    for (var i = 0; i < MinigameLobbies.length; i++){
        Object.defineProperty(MinigameLobbies[i], "clients", { value: {}, writable: true, enumerable: false });
        for (var j = 0; j < MinigameLobbies[i].players.length; j++){
            Object.defineProperty(MinigameLobbies[i].clients, MinigameLobbies[i].players[j], { value: null, writable: true, enumerable: false });
        }
    }
}

function get_lobby(data, ws){
    for (var i = 0; i < MinigameLobbies.length; i++){
        if (MinigameLobbies[i].players.includes(data.token)){
            MinigameLobbies[i].clients[data.token] = ws;

            var lobbyMsg = [];
            for (var j = 0; j < MinigameLobbies[i].players.length; j++){
                lobbyMsg.push({ discord: Players[MinigameLobbies[i].players[j]].discord, ign: Players[MinigameLobbies[i].players[j]].ign });
            }
            return { method: data.method, lobby: lobbyMsg, minigame: MinigameLobbies[i].minigame, pool: MinigameLobbies[i].pool, pass: MinigameLobbies[i].pass, chatHistory: MinigameLobbies[i].chatHistory };
        }
    }
}

function send_message(data){
    if (Object.hasOwn(data, "token")){
        for (var i = 0; i < MinigameLobbies.length; i++){
            if (MinigameLobbies[i].players.includes(data.token)){
                MinigameLobbies[i].chatHistory.push({ sender: Players[data.token].ign, message: data.message });
                for (var j = 0; j < MinigameLobbies[i].players.length; j++){
                    if (MinigameLobbies[i].clients[MinigameLobbies[i].players[j]] !== null){
                        MinigameLobbies[i].clients[MinigameLobbies[i].players[j]].send(JSON.stringify({ method: "send_message", data: { sender: Players[data.token].ign, message: data.message } }));
                    }
                }

                saveData();
                return;
            }
        }
    }
}

function endMinigame(){
    console.log("All Lobbies Finished Minigame");
    var minigameLog = createWriteStream("./data/minigameLog.txt", { flags: "a" });

    for (var i = 0; i < MinigameLobbies.length; i++){
        var playerDataHistory = [];

        for (var j = 0; j < MinigameLobbies[i].players.length; j++){
            playerDataHistory.push(Players[MinigameLobbies[i].players[j]]);

            //Give Reward
            if (Minigames[MinigameLobbies[i].minigame].type == "coin"){
                Players[MinigameLobbies[i].players[j]].coins += Math.floor(Minigames[MinigameLobbies[i].minigame].rewards * MinigameLobbies[i].result[j]);
            }
            else{
                Players[MinigameLobbies[i].players[j]].coins += Minigames[MinigameLobbies[i].minigame].rewards[MinigameLobbies[i].result[j]];
            }
        }

        var logData = { minigame: MinigameLobbies[i].minigame, players: MinigameLobbies[i].players, result: MinigameLobbies[i].result, playerDataHistory: playerDataHistory };
        minigameLog.write(JSON.stringify(logData) + "\n");
    }
    minigameLog.end();
    
    MinigameLobbies = [];

    Metadata.turn++;
    if (Metadata.turn <= Metadata.gameLength){
        addSilverStar();

        Metadata.status = "TURN";
        saveData();

        announce(JSON.stringify({ method: "announcement", status: "TURN", turn: Metadata.turn, silverStar: Metadata.silverStars[Metadata.silverStars.length - 1] }));
    }
    else{
        //GAME OVER
        console.log("Tournament Has Ended!");
        endTournament();
    }
}

function randomMapSpace(){
    var result;
    while(true){
        result = { x: Math.floor(Math.random() * MapData[0].length), y: Math.floor(Math.random() * MapData.length) };
        if (MapData[result.y][result.x].height !== 0 && MapData[result.y][result.x].silverStarSpawnable) return result;
    }
}

const SilverStarSeperationDistance = 5;
function addSilverStar(){
    let starPos;
    while (starPos == null){
        starPos = randomMapSpace();
        //Test if too close to another star
        for (let i = 0; i < Metadata.silverStars.length; i++){
            if (Math.abs(starPos.x - Metadata.silverStars[i].x) + Math.abs(starPos.y - Metadata.silverStars[i].y) < SilverStarSeperationDistance){
                starPos = null;
                break;
            }
        }
        if (starPos == null) continue;
        //Test if spawning on top of a player
        for (const [key, value] of Object.entries(Players)){
            if (value.position.x == starPos.x && value.position.y == starPos.y){
                starPos = null;
                break;
            }
        }
    }

    //Found a position for the star
    Metadata.silverStars.push(starPos);
}

function submit_results(data){
    if (MinigameLobbies.length == 0) return;
    if (Object.hasOwn(Players, data.token)){
        var allLobbiesDone = true;

        //Set Data
        for (var i = 0; i < MinigameLobbies.length; i++){
            if (MinigameLobbies[i].players.includes(data.token)){
                if (!MinigameLobbies[i].scoreConfirm){
                    var resultOutput = new Array(data.result.length);
                    var nextPlacement = 0;
                    var currentPlacement = 0;
                    //Sort Results
                    for (var x = 0; x < data.result.length; x++){
                        for (var y = 0; y < data.result.length; y++){
                            if (Minigames[MinigameLobbies[i].minigame].type == "vs"){
                                if (data.result[y] == x){
                                    resultOutput[y] = currentPlacement;
                                    nextPlacement++;
                                }
                            }
                            else resultOutput[y] = data.result[y];
                        }
                        currentPlacement = nextPlacement;
                    }


                    if (arraysEqual(MinigameLobbies[i].result, resultOutput) || MinigameLobbies[i].players.length < 4){
                        console.log("Minigame Lobby #" + i + " Score Locked");
                        MinigameLobbies[i].result = resultOutput;
                        MinigameLobbies[i].scoreConfirm = true;

                        //Tell all players in lobby that score was locked
                        let message = { sender: "SERVER", message: "confirm", subject: Players[data.token].ign, result: resultOutput };
                        MinigameLobbies[i].chatHistory.push(message);

                        for (var j = 0; j < MinigameLobbies[i].players.length; j++){
                            if (MinigameLobbies[i].clients[MinigameLobbies[i].players[j]] !== null){
                                MinigameLobbies[i].clients[MinigameLobbies[i].players[j]].send(JSON.stringify({ method: "send_message", data: message }));
                            }
                        }
                    }
                    else{
                        MinigameLobbies[i].result = resultOutput;

                        //Tell all players in lobby that score was submitted
                        let message = { sender: "SERVER", message: "submit", subject: Players[data.token].ign };
                        MinigameLobbies[i].chatHistory.push(message);

                        for (var j = 0; j < MinigameLobbies[i].players.length; j++){
                            if (MinigameLobbies[i].clients[MinigameLobbies[i].players[j]] !== null){
                                MinigameLobbies[i].clients[MinigameLobbies[i].players[j]].send(JSON.stringify({ method: "send_message", data: message }));
                            }
                        }
                    }

                    saveData();
                }
            }
            allLobbiesDone = allLobbiesDone && MinigameLobbies[i].scoreConfirm;
        }

        if (allLobbiesDone) endMinigame();
    }
}

function startTournament(){
    Metadata.status = "TURN";
    Metadata.turn = 1;
    Metadata.silverStars = [];
    addSilverStar();

    saveData();

    announce(JSON.stringify({ method: "announcement", status: "TURN", silverStar: Metadata.silverStars[Metadata.silverStars.length - 1] }));

    console.log("TOURNAMENT STARTED!!!");
}

function endTournament(){
    Metadata.status = "RESULTS";

    saveData();

    var publicPlayerData = [];
    for (const [key, value] of Object.entries(Players)) {
        if (value.checkedIn) publicPlayerData.push({ ign: value.ign, coins: value.coins, stars: value.stars });
    }

    announce(JSON.stringify({ method: "announcement", status: "RESULTS", data: publicPlayerData }));
}

function update(){
    var now = Date.now() / 1000;

    if (Metadata.status != "TURN" && Metadata.status != "MINIGAME" && Metadata.status != "RESULTS"){
        if (now < Metadata.startTime - Metadata.checkInLength){
            Metadata.status = "REGISTRATION";
            saveData();
        }
        else if (now < Metadata.startTime){
            Metadata.status = "CHECK_IN";
            saveData();
        }
        else if (Metadata.status == "CHECK_IN" || Metadata.status == "REGISTRATION"){
            startTournament();
        }
    }
    else if (Metadata.status != "RESULTS"){
        var publicPlayerData = [];
        for (const [key, value] of Object.entries(Players)) {
            if (value.checkedIn) publicPlayerData.push({ ign: value.ign, coins: value.coins, stars: value.stars });
        }
        announce(JSON.stringify({ method: "update_player_data", data: publicPlayerData }));
    }
}

function loadData(){
    Metadata = JSON.parse(readFileSync("./data/metadata.json"));
    var backupTemp = readFileSync("./data/backup.json").toString();
    if (backupTemp[0] == "{"){
        console.log("Player Data Found");
        Players = JSON.parse(backupTemp);
    }
    else{
        console.log("No Player Data Available");
        Players = {};
    } 
    var minigameLobbyTemp = readFileSync("./data/minigameLobbies.json").toString();
    if (minigameLobbyTemp[0] == "[") MinigameLobbies = JSON.parse(minigameLobbyTemp);
    else MinigameLobbies = [];
    GenerateMinigameChatroomValues();
}
function saveData(){
    writeFileSync("./data/metadata.json", JSON.stringify(Metadata, null, "\t"));
    writeFileSync("./data/backup.json", JSON.stringify(Players, null, "\t"));
    writeFileSync("./data/minigameLobbies.json", JSON.stringify(MinigameLobbies, null, "\t"));
}

initialize();
/*
!!!TODO!!!
- Add timer for minigames and turns to auto move-on after timer expires
- Test
- BEFORE LAUNCH: Delete Minigame Log on tournament start

Moderator Features:
- View minigame logs nicely
- View a player's history
- Change the results of a minigame (and thus change a player's stats automatically)
- Removing players from the tournament (Might be just as simple as setting checked-in to false)
*/