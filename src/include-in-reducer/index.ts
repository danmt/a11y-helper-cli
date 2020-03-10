/**
 * @license
 * Copyright Google Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
import { strings } from "@angular-devkit/core";
import { Rule, Tree, chain } from "@angular-devkit/schematics";
import * as ts from "typescript";
import {
  insertImport,
  addNewTypeToReducer,
  addActionToReducerComponentLoadedCase,
  addActionToReducerToggleComponentCase
} from "../utility/ast-utils";
import { InsertChange } from "../utility/change";
import { Schema as ModuleOptions } from "./schema";

enum Actions {
  ComponentsLoaded = "componentsLoaded",
  ToggleComponent = "toggleComponent"
}

enum Contexts {
  Api = "api",
  Page = "page"
}

function buildActionsToImport(name: string) {
  return `
    ${strings.classify(name)}ApiActions,
    ${strings.classify(name)}PageActions,
    ${strings.classify(name)}Actions
  `;
}

function buildActionPath(name: string) {
  return `src/app/${strings.dasherize(name)}/actions`;
}

function buildAction(name: string, context: string, action: string) {
  return `${strings.classify(name)}${strings.classify(
    context
  )}Actions.${action},`;
}

function buildActionsType(name: string) {
  return `${strings.classify(name)}Actions`;
}

function addComponentLoadedToReducer(
  path: string,
  module: string,
  reducer: string
): Rule {
  return (host: Tree) => {
    const text = host.read(path);
    if (!text) {
      throw new Error(`Couldn't find the module nor its routing module.`);
    }
    const changes = addActionToReducerComponentLoadedCase(
      ts.createSourceFile(path, text.toString(), ts.ScriptTarget.Latest, true),
      path,
      reducer,
      buildAction(module, Contexts.Api, Actions.ComponentsLoaded)
    ) as InsertChange;
    const recorder = host.beginUpdate(path);
    recorder.insertLeft(changes.pos, changes.toAdd);
    host.commitUpdate(recorder);
    return host;
  };
}

function addToggleComponentToReducer(
  path: string,
  module: string,
  reducer: string
): Rule {
  return (host: Tree) => {
    const text = host.read(path);
    if (!text) {
      throw new Error(`Couldn't find the module nor its routing module.`);
    }
    const changes = addActionToReducerToggleComponentCase(
      ts.createSourceFile(path, text.toString(), ts.ScriptTarget.Latest, true),
      path,
      reducer,
      buildAction(module, Contexts.Page, Actions.ToggleComponent)
    ) as InsertChange;
    const recorder = host.beginUpdate(path);
    recorder.insertLeft(changes.pos, changes.toAdd);
    host.commitUpdate(recorder);
    return host;
  };
}

function addActionsImports(path: string, name: string): Rule {
  return (host: Tree) => {
    const text = host.read(path);
    if (!text) {
      throw new Error(`Couldn't find the module nor its routing module.`);
    }
    const changes = insertImport(
      ts.createSourceFile(path, text.toString(), ts.ScriptTarget.Latest, true),
      path,
      buildActionsToImport(name),
      buildActionPath(name)
    ) as InsertChange;
    const recorder = host.beginUpdate(path);
    recorder.insertLeft(changes.pos, changes.toAdd);
    host.commitUpdate(recorder);
    return host;
  };
}

function addActionsTypesToDeclaration(
  path: string,
  module: string,
  reducerFunction: string
): Rule {
  return (host: Tree) => {
    const text = host.read(path);
    if (!text) {
      throw new Error(`Couldn't find the module nor its routing module.`);
    }
    const changes = addNewTypeToReducer(
      ts.createSourceFile(path, text.toString(), ts.ScriptTarget.Latest, true),
      path,
      reducerFunction,
      buildActionsType(module)
    ) as InsertChange;
    const recorder = host.beginUpdate(path);
    recorder.insertLeft(changes.pos, changes.toAdd);
    host.commitUpdate(recorder);
    return host;
  };
}

export default function(options: ModuleOptions): Rule {
  return async (_: Tree) => {
    const path = "src/app/core/reducers/components.reducer.ts";
    const reducer = "componentsReducer";
    const reducerFunction = "reducer";
    return chain([
      addComponentLoadedToReducer(path, options.name, reducer),
      addToggleComponentToReducer(path, options.name, reducer),
      addActionsImports(path, options.name),
      addActionsTypesToDeclaration(path, options.name, reducerFunction)
    ]);
  };
}
