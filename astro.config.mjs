import {defineConfig} from 'astro/config';
import offline from "astromache/static-offline";
import {site} from './site.config.mjs';
export default defineConfig({site:site.origin,output:'static',prefetch:{prefetchAll:false},integrations:[offline(site.offline)]});
