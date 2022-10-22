#!/usr/bin/env node

import fs from 'fs/promises';
import { Argument, Command } from "commander";
import { collectHistory } from '@/collect/history';
import { knownRegions, parseRegion, Region } from '@/common';

// Global stuff
const program = new Command();
program
	.version('0.2.0')
	.description('Tool to scrap data from Op.GG service.')
	.option('-d, --debug', 'output extra debugging')
	// TODO: 
	// .option('--progress-bars', 'use progress bars where possible to indicate progress')
	.hook('preAction', (thisCommand, actionCommand) => {
		const options = thisCommand.opts();
		if (!options.debug) {
			// Ignore debug output if no debug flag specified
			console.debug = (..._: any[]) => {};
		}
	})
;

// History command
program
	.command('history')
	.addArgument(new Argument('<region>', 'region which on account is registered')
		.argParser(parseRegion)
	)
	.argument('<account>', 'account whom data is related')
	.description('collect match history data for selected account name at selected region')
	.option('-u, --update [maxMinutes]', 'request update before collecting data, optionally only if older than provided', false)
	// TODO: 
	// .option('-o, --output [file]', 'file to where data should be outputted, with file extension defining format', 'data.json')
	// .option('-s, --since-timestamp <sinceTimestamp>', 'collects only matches older than specified timestamp.')
	// .option('-n, --number-of-matches <numberOfMatches>', 'max number of matches to be collected.')
	// .addOption(
	// 	new Option('-q, --queue <queueType>', 'select queue type to collect data from')
	// 		.choices(['solo', 'flex', 'all'])
	// 		.default('solo')
	// )
	.action(async (region: Region | undefined, account: string, options: any, command: Command) => {
		if (!region) {
			console.error(`Unknown region. Supported regions: ${knownRegions.map(x => x.toUpperCase()).join(', ')}.`);
			return;
		}
		const { data } = await collectHistory(region, account, {
			update: options.update ? new Date(Date.now() - parseInt(options.update) * 60 * 1000) : false,
		})
		await fs.writeFile('data.json', JSON.stringify(data));
		console.log('Done.');
	})
;

// TODO: spider
// program 
// 	.command('spider')
// 	.argument('<region>', 'region which on account is registered')
// 	.argument('[account]', 'starting account the data collection should start')
// 	.option('-t, --time <duration>', 'stop collecting after specified time')
// 	.option('-n, --number-of-matches <numberOfMatches>', 'stop collecting after selected number of matches')
// 	.option('-r, --rank <minimalRank> [maxRank]', 'collect data only from selected ranks range')
// ;

// Default command
program
	.argument('<url>', 'collect data from Op.GG URL endpoint')
	.action(args => {
		console.log(`Collecting by URL ${args.url}`)
		// TODO
	})
;

program.parseAsync(process.argv);
