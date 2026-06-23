import css from "rollup-plugin-import-css";
import resolve from "@rollup/plugin-node-resolve";

const inst_path = `workingtitle-instruments-epic2-v2/html_ui/Pages/VCockpit/Instruments/NavSystems/Epic2v2`;
const build_path = `build/${inst_path}`;
const dist_path = `dist/${inst_path}`;

export default [
  {
    input: `${build_path}/TSC/index.js`,
    output: {
      file: `${dist_path}/TSC/Epic2Tsc.js`,
      format: "iife",
      name: "wt_epic2_tsc",
      globals: {
        "@microsoft/msfs-sdk": "msfssdk",
        "@microsoft/msfs-epic2-shared": "wt_epic2_shared",
      },
    },
    external: ["@microsoft/msfs-sdk", "@microsoft/msfs-epic2-shared"],
    plugins: [css({ output: "Epic2Tsc.css" }), resolve()],
  },
];
