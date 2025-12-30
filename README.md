This is the server code for Mega Splat Party. The Mario Party meets Splatoon party game that runs in your browser. Below are instructions on how to host your own private games of Mega Splat Party.

Small forewarning, all of the steps here are written for Windows users. The server should work on linux and mac as well but will have you set it up without a detailed tutorial.

## Prerequisites
- Download MSP-Server as a zip file. To do so, press ``Code`` then ``Download Zip``
- Install [node.js](https://nodejs.org/en/download/current)
- Install [ngrok](https://ngrok.com/) (or any other tunneling alternative for http traffic)

## Setting Up The Server
1. Extract all the files you downloaded
2. Find the file ``index.js``. Right click it and press ``Properties``. Copy the ``Location`` value.
3. Open up Command Prompt. Type in ``cd `` and then paste the file location you copied, then hit enter.
4. Run ``npm install`` to add all dependencies for the server.
5. Open the file ``data/metadata.json`` in a text editor. Replace ``Insert Start Time Here!!!`` with the time you want the game to start at.
 - You can easily get the start time by going to [sesh.fyi/timestamp](https://sesh.fyi/timestamp/), setting the date and time, then copying any option. You can replace ``Insert Start Time Here!!!`` with what you copied. Remove any text you paste that isn't a number.
 - If you want to, you can also change some other settings in this file to change up your game.
6. After you have installed and set up ngrok, Open Windows Powershell and run ``ngrok http 8080`` to start a tunnel. Do not close this window as long as the server is running.
7. If you closed your Command Prompt, reopen it and repeat step 3. Then run ``node index.js`` to run the server.

## Connecting to your Server
You can use the normal website for [Mega Splat Party](https://astroddev.github.io/MegaSplatParty/)
You'll just need to make 1 small change to the URL. Add ``?socket=`` to the end of the URL and then the URL for your server. For example, if your server can be found at **i-like-splatoon.com/server**, the URL you and your friends would connect to would be ``https://astroddev.github.io/MegaSplatParty/?socket=i-like-splatoon.com/server``

After that, you should be good to play. Congratz, you can now ruin your friendships without waiting for AstroDwarf to host a game of Mega Splat Party.
