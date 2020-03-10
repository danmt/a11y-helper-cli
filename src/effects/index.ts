/**
 * @license
 * Copyright Google Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
import { strings } from "@angular-devkit/core";
import {
  Rule,
  Tree,
  apply,
  applyTemplates,
  chain,
  mergeWith,
  move,
  url
} from "@angular-devkit/schematics";
import { Schema as ComponentOptions } from "./schema";

export default function(options: ComponentOptions): Rule {
  return async (_: Tree) => {
    const templateSource = apply(url("./files"), [
      applyTemplates({
        ...strings,
        ...options
      }),
      move(options.path || "")
    ]);
    return chain([mergeWith(templateSource)]);
  };
}
