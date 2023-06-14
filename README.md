
# Op.GG data miner toolkit

Tool to collect data from Op.GG.



### Examples

```
opgg history euw Azzapp
```



### To-do

+ spider mode
+ progress bars
+ handle URLs 
	+ regex: `/(?:(\w+)\.)?op\.gg\/summoners?\/(?:(\w+)\/)?(?:userName=)?([^?#\/\s]*)/i` handles well:
		+ `op.gg/summoners/euw/Azzapp`
		+ `https://www.op.gg/summoners/euw/Azzapp`
		+ `https://euw.op.gg/summoner/userName=AgainPsychoX`
		+ `https://www.op.gg/summoners/euw/Azzapp/matches/ewOhykeZdeeskvBSovvxqie5BuF8-a1Z515jCKtAw2I%3D/1686681922000`
+ ...



