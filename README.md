
# Op.GG data miner toolkit

Toolkit for Op.GG data mining, including crawling pages. The project have educational propose: You might be better of using Riot API than reusing data from aggregator websites like Op.GG.



### Usage

1. Install [Node](https://nodejs.org/en/download/) (LTS should be fine). Make sure they are accessible via `PATH` environment variable.
2. Clone the repository, then navigate with command prompt to the project root directory.
3. Use `npm install` to install dependencies.
4. Run it (multiple options):
	1. You can use `npm run cli:ts` to run it as Typescript (`ts-node` mode), passing params should look like: `npm run cli:ts --- --help`.
	2. You can compile it (to JavaScript) by running `npm run build` once, then you can use `npm run cli:js` in similar fashion as above.
5. <sub><sup>(Optional)</sup></sub> Use `npm link` (with admin privileges) to make the tool available as `opgg --help`.

#### Examples

```properties
# To collect games for certain user, outputs `games.json`
opgg history euw Azzapp

# To collect data for all users (infinite process), see `cache` folder; stop with Ctrl+C
opgg spider euw Azzapp
# and to continue after crash/stopping
opgg spider continue
```



### To-do

+ progress bars
+ handle URLs 
	+ regex: `/(?:(\w+)\.)?op\.gg\/summoners?\/(?:(\w+)\/)?(?:userName=)?([^?#\/\s]*)/i` handles well:
		+ `op.gg/summoners/euw/Azzapp`
		+ `https://www.op.gg/summoners/euw/Azzapp`
		+ `https://euw.op.gg/summoner/userName=AgainPsychoX`
		+ `https://www.op.gg/summoners/euw/Azzapp/matches/ewOhykeZdeeskvBSovvxqie5BuF8-a1Z515jCKtAw2I%3D/1686681922000`
+ distribute work over multiple proxies to avoid 429 Too Many Requests 
+ ...


