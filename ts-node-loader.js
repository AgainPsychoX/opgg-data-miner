// This loader integrates `ts-node` loader with `tsconfig-paths` ability to 
// resolve paths with Typescript path mappings, thanks to that, this module 
// can be loaded directly from Typescript sources using `ts-node`:
// 
// `node --experimental-specifier-resolution=node --loader ./ts-node-loader.js ./src/main.ts`
// 
// Source: https://github.com/TypeStrong/ts-node/discussions/1450
//

import { resolve as resolveTs } from 'ts-node/esm'
import * as tsConfigPaths from 'tsconfig-paths'
import { pathToFileURL } from 'url'

const { absoluteBaseUrl, paths } = tsConfigPaths.loadConfig()
const matchPath = tsConfigPaths.createMatchPath(absoluteBaseUrl, paths)

export function resolve (specifier, ctx, defaultResolve) {
	const match = matchPath(specifier)
	return match
		? resolveTs(pathToFileURL(`${match}`).href, ctx, defaultResolve)
		: resolveTs(specifier, ctx, defaultResolve)
}

export { load, transformSource } from 'ts-node/esm'
