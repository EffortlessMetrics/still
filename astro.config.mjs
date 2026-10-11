import {defineConfig} from 'astro/config';
import offline from "astromache/static-offline";
import {site} from './site.config.mjs';
import sitemap from './scripts/site-output.mjs';
export default defineConfig({site:site.origin,output:'static',prefetch:{prefetchAll:false},integrations:[sitemap(site),offline(site.offline)]});
