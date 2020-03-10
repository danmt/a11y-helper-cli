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
  SchematicsException,
  Tree,
  apply,
  applyTemplates,
  chain,
  mergeWith,
  url,
  move
} from "@angular-devkit/schematics";
import * as ts from "typescript";
import { addDeclarationToModule } from "../utility/ast-utils";
import { InsertChange } from "../utility/change";
import { findModuleFromOptions } from "../utility/find-module";
import { Schema as ComponentOptions } from "./schema";

function buildSelector(name: string) {
  return `app-${name}-page`;
}

function buildComponentName(name: string) {
  return strings.classify(name) + "PageComponent";
}

function readIntoSourceFile(host: Tree, modulePath: string): ts.SourceFile {
  const text = host.read(modulePath);
  if (text === null) {
    throw new SchematicsException(`File ${modulePath} does not exist.`);
  }
  const sourceText = text.toString("utf-8");
  return ts.createSourceFile(
    modulePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true
  );
}

function addDeclarationToNgModule(options: ComponentOptions): Rule {
  return (host: Tree) => {
    if (!options.module) {
      return host;
    }
    const modulePath = options.module;
    const source = readIntoSourceFile(host, modulePath);
    const relativePath = "./containers/page/page.component";
    const componentName = buildComponentName(options.name);
    const declarationChanges = addDeclarationToModule(
      source,
      modulePath,
      componentName,
      relativePath
    );
    const declarationRecorder = host.beginUpdate(modulePath);
    for (const change of declarationChanges) {
      if (change instanceof InsertChange) {
        declarationRecorder.insertLeft(change.pos, change.toAdd);
      }
    }
    host.commitUpdate(declarationRecorder);

    return host;
  };
}

export default function(options: ComponentOptions): Rule {
  return async (host: Tree) => {
    const path = options.path + "/" + strings.dasherize(options.name);
    options.module = findModuleFromOptions(host, options);

    const templateSource = apply(url("./files"), [
      applyTemplates({
        ...strings,
        ...options,
        componentName: buildComponentName(options.name),
        selector: buildSelector(options.name)
      }),
      move(path)
    ]);

    return chain([
      addDeclarationToNgModule(options),
      mergeWith(templateSource)
    ]);
  };
}
