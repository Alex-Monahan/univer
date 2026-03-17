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

import { existsSync } from 'node:fs';
import path from 'node:path';

/**
 * Resolves workspace package `.../lib/...` imports to real files during monorepo builds.
 */
export function createWorkspaceArtifactResolverPlugin(packageDir: string) {
    return {
        name: 'workspace-artifact-resolver',
        resolveId(source: string) {
            if (!source.startsWith('@') || !source.includes('/lib/')) {
                return null;
            }

            const resolvedPath = path.resolve(packageDir, 'node_modules', source);
            return existsSync(resolvedPath) ? resolvedPath : null;
        },
    };
}
