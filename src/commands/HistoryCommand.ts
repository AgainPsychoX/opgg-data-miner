import fs from 'fs/promises';
import { Argument, Command, Option } from "commander";
import { Region, parseRegion, parseTimestamp } from "@/common";
import { collectHistory } from "@/collect/history";

export function registerHistoryCommand(parent: Command) {
	const that = parent
		.command('history')
		.addArgument(new Argument('<region>', 'region which on account is registered')
			.argParser(parseRegion)
		)
		.argument('<account>', 'account whom data is related')
		.description('collect match history data for selected account name at selected region')
		.option('-u, --update [maxMinutes]', 'request update before collecting data, optionally only if older than provided', '10')
		// TODO: 
		// .option('-o, --output [file]', 'file to where data should be outputted, with file extension defining format', 'data.json')
		.addOption(new Option('-a, --after <timestamp>', 'collects only matches younger than specified timestamp.')
			.argParser(parseTimestamp)
		)
		// .addOption(new Option('-b, --before <timestamp>', 'collects only matches older than specified timestamp.')
		// 	.argParser(parseTimestamp)
		// )
		.addOption(new Option('-n, --max-count <number>', 'limits max number of matches to be collected.')
			.argParser(parseInt)
		)
		// .addOption(
		// 	new Option('-q, --queue <queueType>', 'select queue type to collect data from')
		// 		.choices(['solo', 'flex', 'all'])
		// 		.default('solo')
		// )
		.action(async (region: Region, account: string, options: any, command: Command) => {
			const games = await collectHistory(region, account, {
				update: options.update ? new Date(Date.now() - parseInt(options.update) * 60 * 1000) : false,
				maxCount: options.maxCount,
				since: options.after,
				cache: true,
				onRawData: data => fs.writeFile('data.json', JSON.stringify(data)),
			});

			await fs.writeFile('games.json', JSON.stringify(games));
		})
	;
	return that;
}
