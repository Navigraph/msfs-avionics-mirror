import css from 'rollup-plugin-import-css';
import resolve from '@rollup/plugin-node-resolve';
import replace from '@rollup/plugin-replace';

import data from './package.json' assert { type: 'json' };

const packageName = 'workingtitle-instruments-ifd';
const htmlUiPath = 'html_ui/Pages/VCockpit/Instruments/NavSystems/WTIFD';

export default [
  {
    input: `build/${htmlUiPath}/IFD.js`,
    output: {
      file: `dist/${packageName}/${htmlUiPath}/IFD.js`,
      format: 'iife',
      name: 'ifd',
      globals: {
        '@microsoft/msfs-sdk': 'msfssdk',
      }
    },
    external: ['@microsoft/msfs-sdk'],
    plugins: [css({ output: 'IFD.css' }), resolve(), replace({ '__IFD_PACKAGE_VERSION__': data.version, preventAssignment: true })]
  },
];
