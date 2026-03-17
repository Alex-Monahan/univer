/**
 * Copyright 2023-present DreamNum Co., Ltd.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import process from 'node:process';
import { build, buildPresetUMD } from '@univerjs-infra/shared/tsdown';

async function main() {
    await build({ cleanup: true, skipUMD: true });
    await buildPresetUMD({
        umdAdditionalLocales: [
            '@univerjs/design',
        ],
        umdDeps: [
            '@univerjs/ui',
            '@univerjs/docs',
            '@univerjs/docs-ui',
            '@univerjs/sheets',
            '@univerjs/sheets-ui',
            '@univerjs/sheets-formula',
            '@univerjs/sheets-formula-ui',
            '@univerjs/sheets-numfmt',
            '@univerjs/sheets-numfmt-ui',
        ],
    });
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
