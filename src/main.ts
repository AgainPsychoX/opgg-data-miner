#!/usr/bin/env node

import { Command } from "commander";
import { registerHistoryCommand } from "@/commands/HistoryCommand";
import { registerAnalyzeCommand } from "@/commands/AnalyzeCommand";
import { registerSpiderCommand } from "@/commands/SpiderCommand";

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

registerHistoryCommand(program);
registerAnalyzeCommand(program);
registerSpiderCommand(program);

program.parseAsync(process.argv);
