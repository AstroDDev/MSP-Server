import { WebSocketServer } from "ws";
import { readFileSync, writeFileSync, createWriteStream, openSync, write } from "node:fs";

const wss = new WebSocketServer({ port: 8080 });

wss.on("connection", function connection(ws){
    ws.on("message", function m(data){
        var response = message(data, ws);
        
        if (response !== null && response != "") ws.send(JSON.stringify(response));
    });
});

function initialize(){
    loadData();

    if (Metadata.status == "MINIGAME"){
        //Reset the minigame next status timer
        Metadata.nextStatus = Math.ceil(Date.now() / 60000) + Minigames[Metadata.playedMinigames[Metadata.playedMinigames.length - 1]].timeLimit;
        Metadata.minigameStartTime = Math.round(Date.now() / 60000);
    }
    else if (Metadata.status == "TURN"){
        Metadata.nextStatus = Math.ceil(Date.now() / 60000) + Metadata.turnLength;
    }

    MapData = JSON.parse(readFileSync("./data/maps/" + Metadata.map + ".json"));

    setInterval(update, 10000);
}

function announce(msg){
    wss.clients.forEach(function each(client){
        if (client.readyState === 1){//Websocket.OPEN
            client.send(msg);
        }
    });
}

function message(data, ws){
    data = JSON.parse(data);

    console.log(data);

    if (data.method == null) return { error: "could not find method" };

    if (Object.hasOwn(data, "modKey") && data.modKey == Metadata.modKey){
        switch (data.method){
            case "mod_get_metadata":
                return mod_get_metadata(data);
            case "mod_get_player_list":
                return mod_get_player_list(data);
            case "mod_get_minigame_history":
                return mod_get_minigame_history(data);
            case "mod_get_player":
                return mod_get_player(data);
            case "mod_get_minigame":
                return mod_get_minigame(data);
            case "mod_change_result":
                return mod_change_result(data);
            case "mod_delete_player":
                return mod_delete_player(data);
            case "mod_remove_player":
                return mod_remove_player(data);
            case "mod_ban_player":
                return mod_ban_player(data);
            case "mod_unban_player":
                return mod_unban_player(data);
            case "mod_edit_player":
                return mod_edit_player(data);
        }
    }
    else{
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
            case "set_player_data":
                return set_player_data(data);
            case "send_message":
                send_message(data);
                return null;
        }
    }

    return { error: "could not find method" };
}

var Metadata;
var Players = {};
var MinigameLobbies = [];
var Minigames = JSON.parse(readFileSync("./data/minigames.json"));
var Blacklist = JSON.parse(readFileSync("./data/blacklist.json"));
var MapData;
var MinigameLog = [];

function mod_get_metadata(data){
    return { method: data.method, data: Metadata };
}

function mod_get_player_list(data){
    let players = [];
    for (const [key, value] of Object.entries(Players)){
        players.push({ token: key, discord: value.discord, ign: value.ign });
    }
    //Sort alphabetically
    for (var i = 0; i < players.length - 1; i++){
        for (var j = 0; j < players.length - i - 1; j++){
            if (players[j + 1].ign.localeCompare(players[j].ign) == -1){
                //Swap
                let temp = players[j];
                players[j] = players[j + 1];
                players[j + 1] = temp;
            }
        }
    }
    return { method: data.method, data: players };
}

function mod_get_minigame_history(data){
    //Send the entire log file
    return { method: data.method, data: MinigameLog };
}

function mod_get_player(data){
    if (Object.hasOwn(Players, data.token)){
        let minigameHistory = [];
        for (let i = 0; i < Metadata.gameLength; i++) minigameHistory.push("none");
        for (let i = 0; i < MinigameLog.length; i++){
            //past minigames
            if (MinigameLog[i].players.includes(data.token)){
                minigameHistory[MinigameLog[i].turn - 1] = MinigameLog[i].minigame;
            }
        }
        for (let i = 0; i < MinigameLobbies.length; i++){
            //current minigames
            if (MinigameLobbies[i].players.includes(data.token)){
                minigameHistory[Metadata.turn - 1] = MinigameLobbies[i].minigame;
            }
        }
        return { method: data.method, data: Players[data.token], minigameHistory: minigameHistory };
    }
    return { method: data.method, success: false };
}

function mod_get_minigame(data){
    if (Object.hasOwn(data, "token")){
        if (data.turn == Metadata.turn && Metadata.status == "MINIGAME"){
            //On going minigame
            for (let i = 0; i < MinigameLobbies.length; i++){
                if (MinigameLobbies[i].players.includes(data.token)){
                    //Found it
                    return { method: data.method, data: { minigame: MinigameLobbies[i].minigame, players: MinigameLobbies[i].players, setApartPlayers: MinigameLobbies[i].setApartPlayers, result: MinigameLobbies[i].result, chatHistory: MinigameLobbies[i].chatHistory } };
                }
            }
        }
        else{
            //Get from minigame log
            for (let i = 0; i < MinigameLog.length; i++){
                if (data.turn == MinigameLog[i].turn && MinigameLog[i].players.includes(data.token)){
                    //Found it
                    return { method: data.method, data: { minigame: MinigameLog[i].minigame, players: MinigameLog[i].players, setApartPlayers: MinigameLog[i].setApartPlayers, result: MinigameLog[i].result, chatHistory: MinigameLog[i].chatHistory } };
                }
            }
        }
    }
    return { method: data.method, success: false };
}

function mod_change_result(data){
    if (Object.hasOwn(Players, data.token)){
        if (data.turn == Metadata.turn && Metadata.status == "MINIGAME"){
            //Active Lobby
            var allLobbiesDone = true;
            for (let i = 0; i < MinigameLobbies.length; i++){
                if (MinigameLobbies[i].players.includes(data.token)){
                    //Sort data.result
                    if (Minigames[MinigameLobbies[i].minigame].type == "vs"){
                        var resultOutput = new Array(data.result.length);
                        var nextPlacement = 0;
                        var currentPlacement = 0;
                        //Sort Results
                        for (var x = 0; x < data.result.length; x++){
                            for (var y = 0; y < data.result.length; y++){
                                if (data.result[y] == x){
                                    resultOutput[y] = currentPlacement;
                                    nextPlacement++;
                                }
                            }
                            currentPlacement = nextPlacement;
                        }
                        data.result = resultOutput;
                    }

                    MinigameLobbies[i].result = data.result;
                    MinigameLobbies[i].scoreConfirm = true;

                    //Tell all players in lobby that score was locked
                    let message = { sender: "SERVER", message: "confirm", subject: "SERVER", result: data.result };
                    MinigameLobbies[i].chatHistory.push(message);

                    for (let j = 0; j < MinigameLobbies[i].players.length; j++){
                        if (MinigameLobbies[i].clients[MinigameLobbies[i].players[j]] !== null){
                            MinigameLobbies[i].clients[MinigameLobbies[i].players[j]].send(JSON.stringify({ method: "send_message", data: message }));
                        }
                    }
                    saveData();
                }
                allLobbiesDone = allLobbiesDone && MinigameLobbies[i].scoreConfirm;
            }

            if (allLobbiesDone) endMinigame();
        }
        else{
            //Past Lobby
            for (let i = 0; i < MinigameLog.length; i++){
                if (MinigameLog[i].turn == data.turn && MinigameLog[i].players.includes(data.token)){
                    //Sort data.result
                    if (Minigames[MinigameLog[i].minigame].type == "vs"){
                        var resultOutput = new Array(data.result.length);
                        var nextPlacement = 0;
                        var currentPlacement = 0;
                        //Sort Results
                        for (var x = 0; x < data.result.length; x++){
                            for (var y = 0; y < data.result.length; y++){
                                if (data.result[y] == x){
                                    resultOutput[y] = currentPlacement;
                                    nextPlacement++;
                                }
                            }
                            currentPlacement = nextPlacement;
                        }
                        data.result = resultOutput;
                    }

                    //Found it
                    for (let n = 0; n < MinigameLog[i].players.length; n++){
                        //Adjust results for each player
                        if (Object.hasOwn(MinigameLog[i], "bet")){
                            //Subtract the old result then add the new result reward. Makes sure that the lowest possible value is 0
                            //TODO!!! What about ties?
                            if (MinigameLog[i].result.length == 0 || MinigameLog[i].result[0] == MinigameLog[i].result[1]){
                                //Old result was a tie
                                Players[MinigameLog[i].players[n]][MinigameLog[i].bet.type] -= MinigameLog[i].bet.amount;
                            }
                            else{
                                Players[MinigameLog[i].players[n]][MinigameLog[i].bet.type] -= MinigameLog[i].result[n] == 0 ? MinigameLog[i].bet.amount * 2 : 0;
                            }

                            if (data.result[0] == data.result[1]){
                                //Tie
                                Players[MinigameLog[i].players[n]][MinigameLog[i].bet.type] = Math.max(0, Players[MinigameLog[i].players[n]][MinigameLog[i].bet.type] + MinigameLog[i].bet.amount);
                            }
                            else{
                                Players[MinigameLog[i].players[n]][MinigameLog[i].bet.type] = Math.max(0, Players[MinigameLog[i].players[n]][MinigameLog[i].bet.type] + (data.result[n] == 0 ? MinigameLog[i].bet.amount * 2 : 0));
                            }

                            //Players[MinigameLog[i].players[n]][MinigameLog[i].bet.type] = Math.max(0, Players[MinigameLog[i].players[n]][MinigameLog[i].bet.type] - (MinigameLog[i].result[n] == 0 ? MinigameLog[i].bet.amount * 2 : 0) + (data.result[n] == 0 ? MinigameLog[i].bet.amount * 2 : 0));
                        }
                        else if (Minigames[MinigameLog[i].minigame].type == "coin"){
                            if (MinigameLog[i].result.length == 0){
                                //No results were submitted
                                Players[MinigameLog[i].players[n]].coins = Math.max(0, Players[MinigameLog[i].players[n]].coins + Math.floor(Minigames[MinigameLog[i].minigame].rewards * data.result[n]));
                            }
                            else{
                                Players[MinigameLog[i].players[n]].coins = Math.max(0, Players[MinigameLog[i].players[n]].coins - Math.floor(Minigames[MinigameLog[i].minigame].rewards * MinigameLog[i].result[n]) + Math.floor(Minigames[MinigameLog[i].minigame].rewards * data.result[n]));
                            }
                        }
                        else{
                            if (MinigameLog[i].result.length == 0){
                                Players[MinigameLog[i].players[n]].coins = Math.max(0, Players[MinigameLog[i].players[n]].coins + Minigames[MinigameLog[i].minigame].rewards[data.result[n]]);   
                            }
                            else{
                                Players[MinigameLog[i].players[n]].coins = Math.max(0, Players[MinigameLog[i].players[n]].coins - Minigames[MinigameLog[i].minigame].rewards[MinigameLog[i].result[n]] + Minigames[MinigameLog[i].minigame].rewards[data.result[n]]);   
                            } 
                        }
                        Players[MinigameLog[i].players[n]].modFlag = true;
                    }
                    //Resave the entire minigame log
                    MinigameLog[i].result = data.result;
                    overwriteMinigameLog();
                    saveData();
                    break;
                }
            }
        }
    }
}

function mod_delete_player(data){
    if (Object.hasOwn(Players, data.token)){
        delete Players[data.token];
        saveData();
    }
}

function mod_remove_player(data){
    if (Object.hasOwn(Players, data.token)){
        Players[data.token].checkedIn = false;
        saveData();
    }
}

function mod_ban_player(data){
    if (Object.hasOwn(data, "token") && Object.hasOwn(Players, data.token)){
        Blacklist.discord.push(Players[data.token].discord);
        Blacklist.ign.push(Players[data.token].ign);
        delete Players[data.token];
        saveData();
    }
    
    if (Object.hasOwn(data, "discord") && !Blacklist.discord.includes(data.discord)){
        Blacklist.discord.push(data.discord);
    }

    if (Object.hasOwn(data, "ign") && !Blacklist.ign.includes(data.ign)){
        Blacklist.ign.push(data.ign);
    }

    writeFileSync("./data/blacklist.json", JSON.stringify(Blacklist));
}

function mod_unban_player(data){
    if (Object.hasOwn(data, "discord") && Blacklist.discord.includes(data.discord)){
        Blacklist.discord.splice(Blacklist.discord.indexOf(data.discord), 1);
    }

    if (Object.hasOwn(data, "ign") && Blacklist.ign.includes(data.ign)){
        Blacklist.ign.splice(Blacklist.ign.indexOf(data.ign), 1);
    }

    writeFileSync("./data/blacklist.json", JSON.stringify(Blacklist));
}

function mod_edit_player(data){
    if (Object.hasOwn(Players, data.token)){
        if (Object.hasOwn(data, "discord")) Players[data.token].discord = data.discord;
        if (Object.hasOwn(data, "ign")) Players[data.token].ign = data.ign;
        if (Object.hasOwn(data, "checkedIn")) Players[data.token].checkedIn = data.checkedIn;
        if (Object.hasOwn(data, "coins")) Players[data.token].coins = data.coins;
        if (Object.hasOwn(data, "stars")) Players[data.token].stars = data.stars;
        if (Object.hasOwn(data, "canDuel")) Players[data.token].canDuel = data.canDuel;
        if (Object.hasOwn(data, "turnsCompleted")) Players[data.token].turnsCompleted = data.turnsCompleted;
        Players[data.token].modFlag = true;
        saveData();
    }
}



function get_status(data){
    if ((Metadata.status == "TURN" || Metadata.status == "MINIGAME") && Object.hasOwn(data, "token") && Object.hasOwn(Players, data.token) && Players[data.token].checkedIn){
        if (Players[data.token].modFlag){
            return { method: data.method, status: Metadata.status, turn: Metadata.turn, endTime: Metadata.nextStatus, modFlag: true,
                data: { coins: Players[data.token].coins, stars: Players[data.token].stars, turnsCompleted: Players[data.token].turnsCompleted, roll: Players[data.token].roll, items: Players[data.token].items, position: Players[data.token].position, collectedSilverStars: Players[data.token].collectedSilverStars, canDuel: Players[data.token].canDuel, usedItem: Players[data.token].usedItem, tutorial: Players[data.token].tutorial },
                silverStars: Metadata.silverStars
            };
        }
        else{
            return { method: data.method, status: Metadata.status, turn: Metadata.turn, endTime: Metadata.nextStatus, 
                data: { coins: Players[data.token].coins, stars: Players[data.token].stars, turnsCompleted: Players[data.token].turnsCompleted, roll: Players[data.token].roll, items: Players[data.token].items, position: Players[data.token].position, collectedSilverStars: Players[data.token].collectedSilverStars, canDuel: Players[data.token].canDuel, usedItem: Players[data.token].usedItem, tutorial: Players[data.token].tutorial },
                silverStars: Metadata.silverStars
            };
        }
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

function set_player_data(data){
    if (Object.hasOwn(data, "token") && Object.hasOwn(Players, data.token)){
        if (!Players[data.token].modFlag){
            if (Object.hasOwn(data, "coins")) Players[data.token].coins = data.coins;
            if (Object.hasOwn(data, "stars")) Players[data.token].stars = data.stars;
            if (Object.hasOwn(data, "position")) Players[data.token].position = data.position;
            if (Object.hasOwn(data, "collectedSilverStars")) Players[data.token].collectedSilverStars = data.collectedSilverStars;
            if (Object.hasOwn(data, "items")) Players[data.token].items = data.items;
            if (Object.hasOwn(data, "roll")) Players[data.token].roll = data.roll;
            if (Object.hasOwn(data, "duel")) Players[data.token].duel = data.duel;
            if (Object.hasOwn(data, "canDuel")) Players[data.token].canDuel = data.canDuel;
            if (Object.hasOwn(data, "usedItem")) Players[data.token].usedItem = data.usedItem;
            if (Object.hasOwn(data, "tutorial")) Players[data.token].tutorial = data.tutorial;

            saveData();
        }
        else{
            if (Players[data.token].coins == data.coins && Players[data.token].stars == data.stars && Players[data.token].position.x == data.position.x &&
                Players[data.token].position.y == data.position.y && arraysEqual(Players[data.token].collectedSilverStars, data.collectedSilverStars) &&
                arraysEqual(Players[data.token].items, data.items) && Players[data.token].roll == data.roll
            ){
                Players[data.token].modFlag = false;
            }
            else{
                return { method: data.method, success: false, modFlag: true };
            }
        }
    }
    return null;
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
    if (Blacklist.discord.includes(data.discord) || Blacklist.ign.includes(data.ign)){
        return { method: data.method, success: false, error: "player is banned" };
    }

    for (const [key, value] of Object.entries(Players)) {
        if (value.discord == data.discord && value.ign == data.ign){
            return { method: data.method, success: true, token: key, startTime: Metadata.startTime };
        }
        else if (value.discord == data.discord || value.ign == data.ign){
            return { method: data.method, success: false, error: "could not register player" };
        }
    }

    let token = generateLoginToken();
    
    Object.defineProperty(Players, token, {writable: true, enumerable: true, configurable: true, value: { discord: data.discord, ign: data.ign, checkedIn: false, coins: 10, stars: 0, position: {x: 15, y: 30}, collectedSilverStars: [], items: ["doubledice"], usedItem: null, turnsCompleted: 0, roll: 0, canDuel: true, duel: false, modFlag: false, tutorial: true }});
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
    if (Metadata.status != "REGISTRATION"){
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
                return { method: data.method, success: false, modFlag: true, data: { position: Players[data.token].position, coins: Players[data.token].coins, stars: Players[data.token].stars, items: Players[data.token].items, turnsCompleted: Players[data.token].turnsCompleted, collectedSilverStars: Players[data.token].collectedSilverStars, canDuel: Players[data.token].canDuel } };
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
            Players[data.token].duel = data.duel;
            Players[data.token].canDuel = data.canDuel;
            Players[data.token].usedItem = null;
            Players[data.token].roll = 0;

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

var minigameWarnStart = false;
var minigameWarn3Min = false;
var minigameWarn1Min = false;
function checkMinigameStart(){
    var checkedInPlayers = [];

    for (const [key, value] of Object.entries(Players)) {
        if (value.checkedIn){
            if (value.turnsCompleted < Metadata.turn && Date.now() / 60000 < Metadata.nextStatus){
                //Only do this if the turn time limit has not yet run out
                return;
            }
            else if (Date.now() / 60000 >= Metadata.nextStatus && value.turnsCompleted < Metadata.turn){
                //If a player did not complete their turn, remove them
                Players[key].checkedIn = false;
            }
            else{
                checkedInPlayers.push(key);
            }
        }
    }

    //START MINIGAME!!!
    console.log("MINIGAME HAS STARTED!!!");

    var publicPlayerData = [];
    for (const [key, value] of Object.entries(Players)) {
        if (value.checkedIn) publicPlayerData.push({ ign: value.ign, coins: value.coins, stars: value.stars });
    }
    announce(JSON.stringify({ method: "update_player_data", data: publicPlayerData }));

    MinigameLobbies = [];
    minigameWarnStart = false;
    minigameWarn3Min = false;
    minigameWarn1Min = false;
    //Get an unplayed minigame (Now uses the weighted system)
    var minigame = "";
    var minigamePool = [];
    var minigamePoolTotal = 0;
    for (const [key, value] of Object.entries(Minigames)){
        if (!Object.hasOwn(value, "hidden") && !Metadata.playedMinigames.includes(key)){
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

    Metadata.playedMinigames.push(minigame);

    //Sort checked in players by ranking
    for (var i = 0; i < checkedInPlayers.length - 1; i++){
        for (var j = 0; j < checkedInPlayers.length - i - 1; j++){
            let player1Stats = { coins: Players[checkedInPlayers[j]].coins, stars: Players[checkedInPlayers[j]].stars };
            let player2Stats = { coins: Players[checkedInPlayers[j + 1]].coins, stars: Players[checkedInPlayers[j + 1]].stars };
            if (Players[checkedInPlayers[j]].duel) player1Stats[Players[checkedInPlayers[j]].duel.type] += Players[checkedInPlayers[j]].duel.amount;
            if (Players[checkedInPlayers[j + 1]].duel) player1Stats[Players[checkedInPlayers[j + 1]].duel.type] += Players[checkedInPlayers[j + 1]].duel.amount;

            if (player2Stats.stars < player1Stats.stars || (player2Stats.stars == player1Stats.stars && player2Stats.coins < player1Stats.coins) || (player2Stats.stars == player1Stats.stars && player2Stats.coins == player1Stats.coins && Math.random() > 0.5)){
                var temp = checkedInPlayers[j];
                checkedInPlayers[j] = checkedInPlayers[j+1];
                checkedInPlayers[j+1] = temp;
            }
            /*if (Minigames[minigame].type == "coop"){
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
            }*/
        }
    }

    //Make Duel Lobbies
    //Start with matching duelists against each other
    const duelDittoCheckLength = 4;
    const duelNonDuelistLength = 4;
    const duelMOE = 0.25;
    function duelError(bid1, bid2){ return Math.abs(bid1 - bid2) / Math.max(bid1, bid2); }
    var duelLobbiedPlayers = [];
    for (var i = 0; i < checkedInPlayers.length; i++){
        if (Players[checkedInPlayers[i]].duel && !duelLobbiedPlayers.includes(i)){
            let foundDuel = false;
            //Check for players with similar bid
            for (var j = 1; j < duelDittoCheckLength; j++){
                if (i + j < checkedInPlayers.length && !duelLobbiedPlayers.includes(i + j) && Players[checkedInPlayers[i]].duel.type == Players[checkedInPlayers[i + j]].duel.type && duelError(Players[checkedInPlayers[i]].duel.amount, Players[checkedInPlayers[i + j]].duel.amount) < duelMOE){
                    let newBet = { type: Players[checkedInPlayers[i]].duel.type, amount: Math.min(Players[checkedInPlayers[i]].duel.amount, Players[checkedInPlayers[i + j]].duel.amount) };
                    foundDuel = true;
                    duelLobbiedPlayers.push(i);
                    duelLobbiedPlayers.push(i + j);
                    Players[checkedInPlayers[i]][newBet.type] += Players[checkedInPlayers[i]].duel.amount - newBet.amount;
                    Players[checkedInPlayers[i + j]][newBet.type] += Players[checkedInPlayers[i + j]].duel.amount - newBet.amount;
                    MinigameLobbies.push({ minigame: Minigames[minigame].duelMinigame, players: [checkedInPlayers[i], checkedInPlayers[i + j]], pool: generateRoomPool(), pass: generateRoomPassword(), result: [], scoreConfirm: false, setApartPlayers: [], bet: newBet, chatHistory: [] });
                    break;
                }
                if (i - j >= 0 && !duelLobbiedPlayers.includes(i - j) && Players[checkedInPlayers[i]].duel.type == Players[checkedInPlayers[i - j]].duel.type && Players[checkedInPlayers[i]].duel.amount == Players[checkedInPlayers[i - j]].duel.amount){
                    let newBet = { type: Players[checkedInPlayers[i]].duel.type, amount: Math.min(Players[checkedInPlayers[i]].duel.amount, Players[checkedInPlayers[i - j]].duel.amount) };
                    foundDuel = true;
                    duelLobbiedPlayers.push(i);
                    duelLobbiedPlayers.push(i - j);
                    Players[checkedInPlayers[i]][newBet.type] += Players[checkedInPlayers[i]].duel.amount - newBet.amount;
                    Players[checkedInPlayers[i - j]][newBet.type] += Players[checkedInPlayers[i - j]].duel.amount - newBet.amount;
                    MinigameLobbies.push({ minigame: Minigames[minigame].duelMinigame, players: [checkedInPlayers[i], checkedInPlayers[i - j]], pool: generateRoomPool(), pass: generateRoomPassword(), result: [], scoreConfirm: false, setApartPlayers: [], bet: newBet, chatHistory: [] });
                    break;
                }
            }
            
            if (!foundDuel){
                //Could not find a match in range, now checking against all checked-in players
                for (var j = 1; j < duelNonDuelistLength; j++){
                    if (i + j < checkedInPlayers.length && !duelLobbiedPlayers.includes(i + j) && !Players[checkedInPlayers[i + j]].duel && Players[checkedInPlayers[i + j]][Players[checkedInPlayers[i]].duel.type] >= Players[checkedInPlayers[i]].duel.amount) {
                        foundDuel = true;
                        duelLobbiedPlayers.push(i);
                        duelLobbiedPlayers.push(i + j);
                        Players[checkedInPlayers[i + j]][Players[checkedInPlayers[i]].duel.type] -= Players[checkedInPlayers[i]].duel.amount;
                        MinigameLobbies.push({ minigame: Minigames[minigame].duelMinigame, players: [checkedInPlayers[i], checkedInPlayers[i + j]], pool: generateRoomPool(), pass: generateRoomPassword(), result: [], scoreConfirm: false, setApartPlayers: [], bet: Players[checkedInPlayers[i]].duel, chatHistory: [] });
                        break;
                    }
                    if (i - j >= 0 && !duelLobbiedPlayers.includes(i - j) && !Players[checkedInPlayers[i - j]].duel && Players[checkedInPlayers[i - j]][Players[checkedInPlayers[i]].duel.type] >= Players[checkedInPlayers[i]].duel.amount){
                        foundDuel = true;
                        duelLobbiedPlayers.push(i);
                        duelLobbiedPlayers.push(i - j);
                        Players[checkedInPlayers[i - j]][Players[checkedInPlayers[i]].duel.type] -= Players[checkedInPlayers[i]].duel.amount;
                        MinigameLobbies.push({ minigame: Minigames[minigame].duelMinigame, players: [checkedInPlayers[i], checkedInPlayers[i - j]], pool: generateRoomPool(), pass: generateRoomPassword(), result: [], scoreConfirm: false, setApartPlayers: [], bet: Players[checkedInPlayers[i]].duel, chatHistory: [] });
                        break;
                    }
                    if (i - j < 0 && i + j >= checkedInPlayers.length) break;
                }
            }

            if (!foundDuel){
                //Do a duel with a limited bet, refund the rest of resources OR with the first duelist with a similar bet
                for (var j = 1; j < checkedInPlayers.length; j++){
                    if (i + j < checkedInPlayers.length && !duelLobbiedPlayers.includes(i + j) && !Players[checkedInPlayers[i + j]].duel && Players[checkedInPlayers[i + j]][Players[checkedInPlayers[i]].duel.type] > 0){
                        //Normal Player
                        foundDuel = true;
                        let newBet = { type: Players[checkedInPlayers[i]].duel.type, amount: Math.min(Players[checkedInPlayers[i]].duel.amount, Players[checkedInPlayers[i + j]][Players[checkedInPlayers[i]].duel.type]) };
                        duelLobbiedPlayers.push(i);
                        duelLobbiedPlayers.push(i + j);
                        MinigameLobbies.push({ minigame: Minigames[minigame].duelMinigame, players: [checkedInPlayers[i], checkedInPlayers[i + j]], pool: generateRoomPool(), pass: generateRoomPassword(), result: [], scoreConfirm: false, setApartPlayers: [], bet: newBet, chatHistory: [] });
                        Players[checkedInPlayers[i]][Players[checkedInPlayers[i]].duel.type] += Players[checkedInPlayers[i]].duel.amount - newBet.amount;
                        Players[checkedInPlayers[i + j]][Players[checkedInPlayers[i]].duel.type] -= newBet.amount;
                        break;
                    }
                    if (i + j < checkedInPlayers.length && !duelLobbiedPlayers.includes(i + j) && Players[checkedInPlayers[i]].duel.type == Players[checkedInPlayers[i + j]].duel.type && duelError(Players[checkedInPlayers[i]].duel.amount, Players[checkedInPlayers[i + j]].duel.amount) < duelMOE){
                        //Duelist
                        let newBet = { type: Players[checkedInPlayers[i]].duel.type, amount: Math.min(Players[checkedInPlayers[i]].duel.amount, Players[checkedInPlayers[i + j]].duel.amount) };
                        foundDuel = true;
                        duelLobbiedPlayers.push(i);
                        duelLobbiedPlayers.push(i + j);
                        Players[checkedInPlayers[i]][newBet.type] += Players[checkedInPlayers[i]].duel.amount - newBet.amount;
                        Players[checkedInPlayers[i + j]][newBet.type] += Players[checkedInPlayers[i + j]].duel.amount - newBet.amount;
                        MinigameLobbies.push({ minigame: Minigames[minigame].duelMinigame, players: [checkedInPlayers[i], checkedInPlayers[i + j]], pool: generateRoomPool(), pass: generateRoomPassword(), result: [], scoreConfirm: false, setApartPlayers: [], bet: newBet, chatHistory: [] });
                        break;
                    }

                    if (i - j >= 0 && !duelLobbiedPlayers.includes(i - j) && !Players[checkedInPlayers[i - j]].duel && Players[checkedInPlayers[i - j]][Players[checkedInPlayers[i]].duel.type] > 0){
                        foundDuel = true;
                        let newBet = { type: Players[checkedInPlayers[i]].duel.type, amount: Math.min(Players[checkedInPlayers[i]].duel.amount, Players[checkedInPlayers[i - j]][Players[checkedInPlayers[i]].duel.type]) };
                        duelLobbiedPlayers.push(i);
                        duelLobbiedPlayers.push(i - j);
                        MinigameLobbies.push({ minigame: Minigames[minigame].duelMinigame, players: [checkedInPlayers[i], checkedInPlayers[i - j]], pool: generateRoomPool(), pass: generateRoomPassword(), result: [], scoreConfirm: false, setApartPlayers: [], bet: newBet, chatHistory: [] });
                        Players[checkedInPlayers[i]][Players[checkedInPlayers[i]].duel.type] += Players[checkedInPlayers[i]].duel.amount - newBet.amount;
                        Players[checkedInPlayers[i - j]][Players[checkedInPlayers[i]].duel.type] -= newBet.amount;
                        break;
                    }
                    if (i - j >= 0 && !duelLobbiedPlayers.includes(i - j) && Players[checkedInPlayers[i]].duel.type == Players[checkedInPlayers[i - j]].duel.type && Players[checkedInPlayers[i]].duel.amount == Players[checkedInPlayers[i - j]].duel.amount){
                        let newBet = { type: Players[checkedInPlayers[i]].duel.type, amount: Math.min(Players[checkedInPlayers[i]].duel.amount, Players[checkedInPlayers[i - j]].duel.amount) };
                        foundDuel = true;
                        duelLobbiedPlayers.push(i);
                        duelLobbiedPlayers.push(i - j);
                        Players[checkedInPlayers[i]][newBet.type] += Players[checkedInPlayers[i]].duel.amount - newBet.amount;
                        Players[checkedInPlayers[i - j]][newBet.type] += Players[checkedInPlayers[i - j]].duel.amount - newBet.amount;
                        MinigameLobbies.push({ minigame: Minigames[minigame].duelMinigame, players: [checkedInPlayers[i], checkedInPlayers[i - j]], pool: generateRoomPool(), pass: generateRoomPassword(), result: [], scoreConfirm: false, setApartPlayers: [], bet: newBet, chatHistory: [] });
                        break;
                    }

                    if (i - j < 0 && i + j >= checkedInPlayers.length) break;
                }
            }
            
            if (!foundDuel){
                //Refund and cancel
                console.error("Could not lobby player for duel");
                Players[checkedInPlayers[i]][Players[checkedInPlayers[i]].duel.type] += Players[checkedInPlayers[i]].duel.amount;
            }
        }
    }

    //Remove Duel Lobbied Players from checked-in list
    //Sort lobbied indicies
    for (var i = 0; i < duelLobbiedPlayers.length - 1; i++){
        for (var j = 0; j < duelLobbiedPlayers.length - i - 1; j++){
            if (duelLobbiedPlayers[j + 1] > duelLobbiedPlayers[j]){
                let temp = duelLobbiedPlayers[j];
                duelLobbiedPlayers[j] = duelLobbiedPlayers[j + 1];
                duelLobbiedPlayers[j + 1] = temp;
            }
        }
    }
    //Remove indicies from highest to smallest
    while (duelLobbiedPlayers.length > 0){
        checkedInPlayers.splice(duelLobbiedPlayers[0], 1);
        duelLobbiedPlayers.splice(0, 1);
    }

    //New Lobby System
    var numLobbies = Math.ceil(checkedInPlayers.length / Minigames[minigame].lobbySize);
    var lastLobbySize = checkedInPlayers.length % Minigames[minigame].lobbySize;
    var lastLobbyPlacement = Math.floor(Math.random() * numLobbies);

    var currentPlacement = 0;
    for (var i = 0; i < numLobbies; i++){
        let thisLobbySize = i == lastLobbyPlacement ? lastLobbySize : Minigames[minigame].lobbySize;
        var players = [];
        var setApartPlayers = [];
        for (var j = 0; j < Minigames[minigame].lobbySize; j++){
            players.push(checkedInPlayers[currentPlacement]);
            currentPlacement++;

            if (Object.hasOwn(Minigames[minigame], "setApartPlayers") && 
                ((setApartPlayers.length < Minigames[minigame].setApartPlayers && Math.random() * thisLobbySize < 1) || //Checks for randomly setting apart players
                (thisLobbySize - j <= (Minigames[minigame].setApartPlayers - setApartPlayers.length)))){//Checks if every player left needs to be set apart
                setApartPlayers.push(j);
            }

            if (lastLobbySize > 0 && i == lastLobbyPlacement && j == lastLobbySize - 1) break;
            if (currentPlacement == checkedInPlayers.length) break;
        }

        if (lastLobbySize > 0 && i == lastLobbyPlacement){
            if (lastLobbySize == 1){
                MinigameLobbies.push({ minigame: Minigames[minigame].soloMinigame, players: players, pool: generateRoomPool(), pass: generateRoomPassword(), result: [], scoreConfirm: false, setApartPlayers: [], chatHistory: [] });
            }
            else if ((lastLobbySize % 2 == 1 && Minigames[minigame].evenSize) || (lastLobbySize < Minigames[minigame].minLobbySize)){
                if (lastLobbySize - 1 >= Minigames[minigame].minLobbySize){
                    //Put 1 player in a solo minigame, put everyone else in the normal minigame
                    let removePlayer;
                    for (let n = 0; n < players.length; n++) if (!setApartPlayers.includes(n)) removePlayer = n;
                    let removePlayerToken = players[n];
                    players.splice(n, 1);
                    MinigameLobbies.push({ minigame: minigame, players: players, pool: generateRoomPool(), pass: generateRoomPassword(), result: [], scoreConfirm: false, setApartPlayers: setApartPlayers, chatHistory: [] });
                    MinigameLobbies.push({ minigame: Minigames[minigame].soloMinigame, players: [removePlayerToken], pool: generateRoomPool(), pass: generateRoomPassword(), result: [], scoreConfirm: false, setApartPlayers: [], chatHistory: [] });
                }
                else{
                    MinigameLobbies.push({ minigame: Minigames[minigame].extraMinigame, players: players, pool: generateRoomPool(), pass: generateRoomPassword(), result: [], scoreConfirm: false, setApartPlayers: [], chatHistory: [] });
                }
            }
            else{
                MinigameLobbies.push({ minigame: minigame, players: players, pool: generateRoomPool(), pass: generateRoomPassword(), result: [], scoreConfirm: false, setApartPlayers: setApartPlayers, chatHistory: [] });
            }
        }
        else{
            MinigameLobbies.push({ minigame: minigame, players: players, pool: generateRoomPool(), pass: generateRoomPassword(), result: [], scoreConfirm: false, setApartPlayers: setApartPlayers, chatHistory: [] });
        }
    }
    
    Metadata.status = "MINIGAME";
    Metadata.nextStatus = Math.ceil(Date.now() / 60000) + Minigames[minigame].timeLimit; //60000 converts from milliseconds to minutes
    Metadata.minigameStartTime = Math.round(Date.now() / 60000);

    GenerateMinigameChatroomValues();

    saveData();

    announce(JSON.stringify({ method: "announcement", status: "MINIGAME" }));
}

function GenerateMinigameChatroomValues(){
    if (MinigameLobbies.length == 0) return;
    for (var i = 0; i < MinigameLobbies.length; i++){
        Object.defineProperty(MinigameLobbies[i], "clients", { value: {}, writable: true, configurable: true, enumerable: false });
        for (var j = 0; j < MinigameLobbies[i].players.length; j++){
            Object.defineProperty(MinigameLobbies[i].clients, MinigameLobbies[i].players[j], { value: null, writable: true, configurable: true, enumerable: false });
        }
    }
}

function get_lobby(data, ws){
    for (var i = 0; i < MinigameLobbies.length; i++){
        if (MinigameLobbies[i].players.includes(data.token)){
            MinigameLobbies[i].clients[data.token] = ws;

            var lobbyMsg = [];
            for (var j = 0; j < MinigameLobbies[i].players.length; j++){
                if (!Object.hasOwn(Players, MinigameLobbies[i].players[j])){
                    lobbyMsg.push({ discord: "", ign: "[deleted]#0000" });
                }
                else lobbyMsg.push({ discord: Players[MinigameLobbies[i].players[j]].discord, ign: Players[MinigameLobbies[i].players[j]].ign });
            }
            if (Object.hasOwn(MinigameLobbies[i], "bet")){
                return { method: data.method, success: true, startTime: Metadata.minigameStartTime, endTime: Metadata.nextStatus, lobby: lobbyMsg, minigame: MinigameLobbies[i].minigame, pool: MinigameLobbies[i].pool, pass: MinigameLobbies[i].pass, setApartPlayers: MinigameLobbies[i].setApartPlayers, bet: MinigameLobbies[i].bet, chatHistory: MinigameLobbies[i].chatHistory };
            }
            else{
                return { method: data.method, success: true, startTime: Metadata.minigameStartTime, endTime: Metadata.nextStatus, lobby: lobbyMsg, minigame: MinigameLobbies[i].minigame, pool: MinigameLobbies[i].pool, pass: MinigameLobbies[i].pass, setApartPlayers: MinigameLobbies[i].setApartPlayers, chatHistory: MinigameLobbies[i].chatHistory };
            }
        }
    }
    if (Object.hasOwn(Players, data.token)){
        return { method: data.method, success: false, checkedIn: Players[data.token].checkedIn };
    }
    else return { method: data.method, success: false };
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

function minigameServerMessage(msg){
    let message = { sender: "SERVER", message: msg };
    let wsMessage = JSON.stringify({ method: "send_message", data: message });
    for (var i = 0; i < MinigameLobbies.length; i++){
        MinigameLobbies[i].chatHistory.push(message);
        for (var j = 0; j < MinigameLobbies[i].players.length; j++){
            if (MinigameLobbies[i].clients[MinigameLobbies[i].players[j]] !== null){
                MinigameLobbies[i].clients[MinigameLobbies[i].players[j]].send(wsMessage);
            }
        }
    }
    saveData();
}

function endMinigame(){
    console.log("All Lobbies Finished Minigame");
    var minigameLogFile = createWriteStream("./data/minigameLog.txt", { flags: "a" });

    for (var i = 0; i < MinigameLobbies.length; i++){
        for (var j = 0; j < MinigameLobbies[i].players.length; j++){
            if (!Object.hasOwn(Players, MinigameLobbies[i].players[j])) continue;
            //Give Reward
            if (Object.hasOwn(MinigameLobbies[i], "bet")){
                //Duel Minigame Reward
                if (MinigameLobbies[i].result.length == 0 || MinigameLobbies[i].result[0] == MinigameLobbies[i].result[1]){
                    //Tie!!! Everyone gets their money back
                    Players[MinigameLobbies[i].players[j]][MinigameLobbies[i].bet.type] += MinigameLobbies[i].bet.amount;
                }
                else Players[MinigameLobbies[i].players[j]][MinigameLobbies[i].bet.type] += MinigameLobbies[i].result[j] == 0 ? MinigameLobbies[i].bet.amount * 2 : 0;
            }
            else if (MinigameLobbies[i].result.length == 0){
                //Do Nothing, players did not finish their minigame in time
            }
            else if (Minigames[MinigameLobbies[i].minigame].type == "coin"){
                Players[MinigameLobbies[i].players[j]].coins += Math.floor(Minigames[MinigameLobbies[i].minigame].rewards * MinigameLobbies[i].result[j]);
            }
            else{
                Players[MinigameLobbies[i].players[j]].coins += Minigames[MinigameLobbies[i].minigame].rewards[MinigameLobbies[i].result[j]];
            }
            //Reset roll for next turn
            Players[MinigameLobbies[i].players[j]].roll = 0;
            Players[MinigameLobbies[i].players[j]].usedItem = null;
        }

        var logData = { turn: Metadata.turn, minigame: MinigameLobbies[i].minigame, players: MinigameLobbies[i].players, setApartPlayers: MinigameLobbies[i].setApartPlayers, result: MinigameLobbies[i].result, chatHistory: MinigameLobbies[i].chatHistory };
        if (Object.hasOwn(MinigameLobbies[i], "bet")){
            Object.defineProperty(logData, "bet", { enumerable: true, configurable: true, writable: true, value: MinigameLobbies[i].bet});
        }
        minigameLogFile.write(JSON.stringify(logData) + "\n");
        MinigameLog.push(logData);
    }
    minigameLogFile.end();
    
    MinigameLobbies = [];

    Metadata.turn++;
    Metadata.nextStatus = Math.ceil(Date.now() / 60000) + Metadata.turnLength; //60000 converts from milliseconds to minutes
    if (Metadata.turn <= Metadata.gameLength){
        addSilverStar();

        Metadata.status = "TURN";
        saveData();

        if (Metadata.generateSilverStars) announce(JSON.stringify({ method: "announcement", status: "TURN", turn: Metadata.turn, silverStar: Metadata.silverStars[Metadata.silverStars.length - 1] }));
        else announce(JSON.stringify({ method: "announcement", status: "TURN", turn: Metadata.turn, endTime: Metadata.nextStatus }));
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

const SilverStarSeperationDistance = 6;
function addSilverStar(){
    if (Metadata.generateSilverStars){
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
    Metadata.playedMinigames = [];
    Metadata.nextStatus = Math.ceil(Date.now() / 60000) + Metadata.turnLength; //60000 converts from milliseconds to minutes

    //Delete minigame log
    writeFileSync("./data/minigameLog.txt", "");

    addSilverStar();

    saveData();

    announce(JSON.stringify({ method: "announcement", status: "TURN", turn: Metadata.turn, silverStar: Metadata.silverStars[Metadata.silverStars.length - 1] }));

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

        if (Metadata.status == "MINIGAME"){
            //Minigame warning messages
            if (!minigameWarnStart && now / 60 - Metadata.minigameStartTime >= 3.5){
                minigameWarnStart = true;
                minigameServerMessage("warnStart");
            }
            else if (!minigameWarn3Min && Metadata.nextStatus - (now / 60) <= 3){
                minigameWarn3Min = true;
                minigameServerMessage("warn3min");
            }
            else if (!minigameWarn1Min && Metadata.nextStatus - (now / 60) <= 1){
                minigameWarn1Min = true;
                minigameServerMessage("warn1min");
            }
        }
        
        //Next status timer
        if (now / 60 >= Metadata.nextStatus){
            if (Metadata.status == "TURN"){
                checkMinigameStart();
            }
            else if (Metadata.status == "MINIGAME"){
                endMinigame();
            }
        }
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

    //Minigame log
    let logData = readFileSync("./data/minigameLog.txt").toString().split("\n");
    for (let i = 0; i < logData.length - 1; i++){
        MinigameLog.push(JSON.parse(logData[i]));
    }
}
function saveData(){
    writeFileSync("./data/metadata.json", JSON.stringify(Metadata, null, "\t"));
    writeFileSync("./data/backup.json", JSON.stringify(Players, null, "\t"));
    writeFileSync("./data/minigameLobbies.json", JSON.stringify(MinigameLobbies, null, "\t"));
}
function overwriteMinigameLog(){
    writeFileSync("./data/minigameLog.txt", "");
    var minigameLogFile = createWriteStream("./data/minigameLog.txt", { flags: "a" });

    for (let i = 0; i < MinigameLog.length; i++){
        minigameLogFile.write(JSON.stringify(MinigameLog[i]) + "\n");
    }

    minigameLogFile.end();
}

initialize();
/*
Moderator Features:
- View minigame logs nicely
- View a player's history
- Change the results of a minigame (and thus change a player's stats automatically)
- Removing players from the tournament (Might be just as simple as setting checked-in to false)
*/