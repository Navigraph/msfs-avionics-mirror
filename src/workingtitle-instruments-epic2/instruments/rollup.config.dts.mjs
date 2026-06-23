import { dts } from "rollup-plugin-dts";

const src_path = `html_ui/Pages/VCockpit/Instruments/NavSystems/Epic2v2`;

export default [
  {
    input: `${src_path}/TSC/index.ts`,
    output: {
      file: `dist-types/2024-Epic2Tsc.d.ts`,
      format: "es",
    },
    external: [
      /@microsoft\/msfs-sdk/,
      /@microsoft\/msfs-epic2-shared/,
      /\.(css|svg|png|jpe?g|gif)$/,
    ],
    plugins: [dts()],
  },
];
