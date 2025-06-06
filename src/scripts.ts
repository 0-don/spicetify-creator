import fs from 'fs'
import path from 'path'
import { promisify } from 'util'
import { ICustomAppSettings, IExtensionSettings } from './helpers/models'
import buildCustomApp from './buildCustomApp'
import buildExtension from './buildExtension'
import { externalGlobalPlugin } from 'esbuild-plugin-external-global'
const postCssPlugin = require("esbuild-plugin-postcss2");
const autoprefixer = require("autoprefixer");

const exec = promisify(require('child_process').exec);

const build = async (watch: boolean, minify: boolean, outDirectory?: string, inDirectory?: string) => {
  if (!inDirectory) inDirectory = './src';
  const settings: ICustomAppSettings & IExtensionSettings = JSON.parse(fs.readFileSync(`${inDirectory}/settings.json`, 'utf-8'));
  const isExtension = !Object.keys(settings).includes("icon");
  const id = settings.nameId.replace(/\-/g, 'D');
  
  if (isExtension) {
    console.log("Extension detected");
  } else {
    console.log("Custom App detected");
  }
  
  if (!outDirectory) {
    const spicetifyDirectory = await exec("spicetify -c").then((o: any) => path.dirname(o.stdout.trim()));
    if (isExtension) {
      outDirectory = path.join(spicetifyDirectory, "Extensions");
    } else {
      outDirectory = path.join(spicetifyDirectory, "CustomApps", settings.nameId);
    }
  }

  // Create outDirectory if it doesn't exists
  if (!fs.existsSync(outDirectory)){
    fs.mkdirSync(outDirectory, { recursive: true });
  }

  // Load PostCSS config or fallback to autoprefixer
  let postCSSPlugins = [autoprefixer];
  try {
    const postcssrc = require('postcss-load-config');
    const { plugins } = await postcssrc({}, path.dirname(inDirectory));
    postCSSPlugins = plugins;
  } catch {}

  const esbuildOptions = {
    platform: 'browser',
    external: ['react', 'react-dom'],
    bundle: true,
    globalName: id,
    plugins: [
      postCssPlugin.default({
        plugins: postCSSPlugins,
        modules: {
          generateScopedName: `[name]__[local]___[hash:base64:5]_${id}`
        },
      }),
      externalGlobalPlugin({
        'react': 'Spicetify.React',
        'react-dom': 'Spicetify.ReactDOM',
      })
    ],
  }

  if (isExtension) {
    buildExtension(settings, outDirectory, watch, esbuildOptions, minify, inDirectory);
  } else {
    buildCustomApp(settings, outDirectory, watch, esbuildOptions, minify, inDirectory);
  }
  

  if (watch) {
    console.log('Watching...');
  }
};

export { build };