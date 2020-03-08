/**
 * @license
 * Copyright Google Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
import { strings } from "@angular-devkit/core";
import {
  FileOperator,
  Rule,
  Tree,
  apply,
  applyTemplates,
  chain,
  forEach,
  mergeWith,
  move,
  noop,
  url
} from "@angular-devkit/schematics";
import { parseName } from "../utility/parse-name";
import { buildDefaultPath, getWorkspace } from "../utility/workspace";
import { Schema as ComponentOptions } from "./schema";

export default function(options: ComponentOptions): Rule {
  return async (host: Tree) => {
    const workspace = await getWorkspace(host);
    const project = workspace.projects.get(options.project as string);

    if (options.path === undefined && project) {
      options.path = buildDefaultPath(project);
    }

    const parsedPath = parseName(options.path as string, options.name);
    options.name = parsedPath.name;
    options.path = parsedPath.path;

    const templateSource = apply(url("./files"), [
      applyTemplates({
        ...strings,
        ...options
      }),
      !options.type
        ? forEach((file => {
            if (!!file.path.match(new RegExp(".."))) {
              return {
                content: file.content,
                path: file.path.replace("..", ".")
              };
            } else {
              return file;
            }
          }) as FileOperator)
        : noop(),
      move(parsedPath.path)
    ]);

    return chain([mergeWith(templateSource)]);
  };
}
