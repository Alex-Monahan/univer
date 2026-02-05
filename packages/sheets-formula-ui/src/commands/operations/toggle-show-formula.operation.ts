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

import type { IAccessor, ICommand } from '@univerjs/core';
import { CommandType, IContextService } from '@univerjs/core';
import { RENDER_RAW_FORMULA_KEY } from '@univerjs/engine-render';

export interface IToggleShowFormulaOperationParams {
    force?: boolean;
}

export const ToggleShowFormulaOperation: ICommand = {
    id: 'formula-ui.operation.toggle-show-formula',
    type: CommandType.OPERATION,
    handler: (accessor: IAccessor, params?: IToggleShowFormulaOperationParams) => {
        const contextService = accessor.get(IContextService);
        const current = contextService.getContextValue(RENDER_RAW_FORMULA_KEY);
        const nextValue = params?.force ?? !current;

        if (current === nextValue) {
            return false;
        }

        contextService.setContextValue(RENDER_RAW_FORMULA_KEY, nextValue);
        return true;
    },
};
