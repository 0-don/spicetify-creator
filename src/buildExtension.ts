import chalk from "chalk";
import esbuild from "esbuild";
import fs from "fs";
import { glob } from "glob";
import os from "os";
import path from "path";
import { minifyCSS, minifyFile } from "./helpers/minify";
import { IExtensionSettings } from "./helpers/models";

export default async (
  settings: IExtensionSettings,
  outDirectory: string,
  watch: boolean,
  esbuildOptions: any,
  minify: boolean,
  inDirectory: string
) => {
  // const extension = path.join("./src/", "app.tsx")
  // const extensionName = path.basename(extension.substring(0, extension.lastIndexOf(".")));
  const compiledExtension = path.join(outDirectory, `${settings.nameId}.js`);
  const compiledExtensionCSS = path.join(
    outDirectory,
    `${settings.nameId}.css`
  );

  const appPath = path.resolve(
    glob.sync(`${inDirectory}/*(app.ts|app.tsx|app.js|app.jsx)`)[0]
  );
  const tempFolder = path.join(os.tmpdir(), "spicetify-creator");
  const indexPath = path.join(tempFolder, `index.jsx`);

  if (!fs.existsSync(tempFolder)) fs.mkdirSync(tempFolder);
  fs.writeFileSync(
    indexPath,
    `
import main from \'${appPath.replace(/\\/g, "/")}\'

(async () => {
  await main()
})();
  `.trim()
  );

  const afterBundle = async () => {
    if (fs.existsSync(compiledExtensionCSS)) {
      console.log("!!Bundling css and js...");

      let css = fs.readFileSync(compiledExtensionCSS, "utf-8");
      if (minify) {
        css = await minifyCSS(css);
      }

      fs.rmSync(compiledExtensionCSS);
      fs.appendFileSync(
        compiledExtension,
        `
  
  (async () => {
    if (!document.getElementById(\`${esbuildOptions.globalName}\`)) {
      var el = document.createElement('style');
      el.id = \`${esbuildOptions.globalName}\`;
      el.textContent = (String.raw\`
  ${css}
      \`).trim();
      document.head.appendChild(el);
    }
  })()
  
      `.trim()
      );
    }

    // Account for dynamic hooking of React and ReactDOM
    fs.writeFileSync(
      compiledExtension,
      `
      (async function() {
        while (!Spicetify.React || !Spicetify.ReactDOM) {
          await new Promise(resolve => setTimeout(resolve, 10));
        }
        ${fs.readFileSync(compiledExtension, "utf-8")}
      })();
    `.trim()
    );

    if (minify) {
      console.log("Minifying...");
      await minifyFile(compiledExtension);
    }

    console.log(chalk.green("Build succeeded."));
  };

  const buildOptions = {
    entryPoints: [indexPath],
    outfile: compiledExtension,
    ...esbuildOptions,
  };

  if (watch) {
    const ctx = await esbuild.context({
      ...buildOptions,
      plugins: [
        ...(buildOptions.plugins || []),
        {
          name: "rebuild-notify",
          setup(build: any) {
            build.onEnd(async (result: any) => {
              if (result.errors.length === 0) {
                await afterBundle();
              }
            });
          },
        },
      ],
    });
    await ctx.watch();
    await afterBundle();
  } else {
    await esbuild.build(buildOptions);
    await afterBundle();
  }
};
