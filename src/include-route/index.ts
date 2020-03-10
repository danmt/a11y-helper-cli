/**
 * @license
 * Copyright Google Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
import { strings } from "@angular-devkit/core";
import { Rule, Tree } from "@angular-devkit/schematics";
import * as ts from "typescript";
import { addToArray } from "../utility/ast-utils";
import { InsertChange } from "../utility/change";
import { Schema as ModuleOptions } from "./schema";

function buildRoute(name: string) {
  return `{
    title: '${strings.classify(name)}',
    path: '/${strings.dasherize(name)}'
  }`;
}

function addRouteToCoreRoutes(
  path: string,
  module: string,
  variableName: string
): Rule {
  return (host: Tree) => {
    const text = host.read(path);
    if (!text) {
      throw new Error(`Couldn't find the module nor its routing module.`);
    }
    const changes = addToArray(
      ts.createSourceFile(path, text.toString(), ts.ScriptTarget.Latest, true),
      path,
      variableName,
      buildRoute(module)
    ) as InsertChange;
    const recorder = host.beginUpdate(path);
    recorder.insertLeft(changes.pos, changes.toAdd);
    host.commitUpdate(recorder);
    return host;
  };
}

export default function(options: ModuleOptions): Rule {
  return async (_: Tree) => {
    const path = "src/app/core/consts/routes.const.ts";
    const variableName = "ROUTES";
    return addRouteToCoreRoutes(path, options.name, variableName);
  };
}
