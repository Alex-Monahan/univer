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

import { IContextService, Inject, InterceptorEffectEnum, isFormulaId, isFormulaString, RxDisposable } from '@univerjs/core';
import { extractFormulaError, FormulaDataModel } from '@univerjs/engine-formula';
import { RENDER_RAW_FORMULA_KEY } from '@univerjs/engine-render';
import { INTERCEPTOR_POINT, SheetInterceptorService } from '@univerjs/sheets';

const FORMULA_ERROR_MARK = {
    tl: {
        size: 6,
        color: '#409f11',
    },
};

export class FormulaRenderManagerController extends RxDisposable {
    private _renderRawFormula = false;

    constructor(
        @Inject(SheetInterceptorService) private readonly _sheetInterceptorService: SheetInterceptorService,
        @Inject(FormulaDataModel) private readonly _formulaDataModel: FormulaDataModel,
        @IContextService private readonly _contextService: IContextService
    ) {
        super();

        this._initRenderRawFormulaListener();
        this._initFormulaErrorMarker();
        this._initRawFormulaInterceptor();
    }

    private _initRenderRawFormulaListener(): void {
        this.disposeWithMe(
            this._contextService.subscribeContextValue$(RENDER_RAW_FORMULA_KEY).subscribe((value) => {
                this._renderRawFormula = value;
            })
        );
    }

    private _initFormulaErrorMarker(): void {
        this.disposeWithMe(this._sheetInterceptorService.intercept(
            INTERCEPTOR_POINT.CELL_CONTENT,
            {
                effect: InterceptorEffectEnum.Style,
                handler: (cell, pos, next) => {
                    const arrayFormulaCellData = this._formulaDataModel.getArrayFormulaCellData()?.
                        [pos.unitId]?.
                        [pos.subUnitId]?.
                        [pos.row]?.
                        [pos.col];

                    const errorType = extractFormulaError(cell, !!arrayFormulaCellData);
                    if (!errorType) {
                        return next(cell);
                    }

                    if (!cell) {
                        return next(cell);
                    }

                    if (cell === pos.rawData) {
                        cell = { ...pos.rawData };
                    }

                    cell.markers = {
                        ...cell?.markers,
                        ...FORMULA_ERROR_MARK,
                    };

                    return next(cell);
                },
                priority: 10,
            }
        ));
    }

    private _initRawFormulaInterceptor(): void {
        this.disposeWithMe(this._sheetInterceptorService.intercept(
            INTERCEPTOR_POINT.CELL_CONTENT,
            {
                effect: InterceptorEffectEnum.Value,
                handler: (cell, pos, next) => {
                    if (!this._renderRawFormula) {
                        return next(cell);
                    }

                    const rawCell = pos.rawData;
                    if (!rawCell) {
                        return next(cell);
                    }

                    let formulaString: string | null = null;

                    if (isFormulaString(rawCell.f)) {
                        formulaString = rawCell.f;
                    } else if (isFormulaId(rawCell.si)) {
                        formulaString = this._formulaDataModel.getFormulaStringByCell(
                            pos.row,
                            pos.col,
                            pos.subUnitId,
                            pos.unitId
                        );
                    }

                    if (!formulaString) {
                        return next(cell);
                    }

                    if (!cell || cell === rawCell) {
                        cell = { ...rawCell };
                    }

                    cell.f = formulaString;
                    return next(cell);
                },
                priority: 1,
            }
        ));
    }
}
