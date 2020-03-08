/**
 * @license
 * Copyright Google Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
import { Path, normalize, strings } from "@angular-devkit/core";
import {
  Rule,
  Tree,
  apply,
  applyTemplates,
  chain,
  mergeWith,
  move,
  noop,
  schematic,
  url,
  SchematicsException
} from "@angular-devkit/schematics";
import * as ts from "typescript";
import {
  addRouteDeclarationToModule,
  addImportToModule,
  addToArray,
  getReducerComponentLoadedCase,
  getReducerToggleComponentCase,
  insertImport,
  addNewTypeToReducer
} from "../utility/ast-utils";
import { InsertChange } from "../utility/change";
import {
  MODULE_EXT,
  ROUTING_MODULE_EXT,
  buildRelativePath,
  findModuleFromOptions
} from "../utility/find-module";
import { applyLintFix } from "../utility/lint-fix";
import { parseName } from "../utility/parse-name";
import { createDefaultPath } from "../utility/workspace";
import { Schema as ModuleOptions } from "./schema";

enum RoutingScope {
  Child = "Child",
  Root = "Root"
}

function buildRelativeModulePath(
  options: ModuleOptions,
  modulePath: string
): string {
  const importModulePath = normalize(
    `/${options.path}/` +
      (options.flat ? "" : strings.dasherize(options.name) + "/") +
      strings.dasherize(options.name) +
      ".module"
  );

  return buildRelativePath(modulePath, importModulePath);
}

function addDeclarationToNgModule(options: ModuleOptions): Rule {
  return (host: Tree) => {
    if (!options.module) {
      return host;
    }

    const modulePath = options.module;

    const text = host.read(modulePath);
    if (text === null) {
      throw new SchematicsException(`File ${modulePath} does not exist.`);
    }
    const sourceText = text.toString();
    const source = ts.createSourceFile(
      modulePath,
      sourceText,
      ts.ScriptTarget.Latest,
      true
    );

    const relativePath = buildRelativeModulePath(options, modulePath);
    const changes = addImportToModule(
      source,
      modulePath,
      strings.classify(`${options.name}Module`),
      relativePath
    );

    const recorder = host.beginUpdate(modulePath);
    for (const change of changes) {
      if (change instanceof InsertChange) {
        recorder.insertLeft(change.pos, change.toAdd);
      }
    }
    host.commitUpdate(recorder);

    return host;
  };
}

function addRouteDeclarationToNgModule(
  options: ModuleOptions,
  routingModulePath: Path | undefined
): Rule {
  return (host: Tree) => {
    if (!options.route) {
      return host;
    }
    if (!options.module) {
      throw new Error(
        "Module option required when creating a lazy loaded routing module."
      );
    }

    let path: string;
    if (routingModulePath) {
      path = routingModulePath;
    } else {
      path = options.module;
    }

    const text = host.read(path);
    if (!text) {
      throw new Error(`Couldn't find the module nor its routing module.`);
    }

    const sourceText = text.toString();
    const addDeclaration = addRouteDeclarationToModule(
      ts.createSourceFile(path, sourceText, ts.ScriptTarget.Latest, true),
      path,
      buildRoute(options, options.module)
    ) as InsertChange;

    const recorder = host.beginUpdate(path);
    recorder.insertLeft(addDeclaration.pos, addDeclaration.toAdd);
    host.commitUpdate(recorder);

    return host;
  };
}

function addRouteToCoreRoutes(
  path: string,
  classified: string,
  dasherized: string
): Rule {
  return (host: Tree) => {
    const text = host.read(path);
    if (!text) {
      throw new Error(`Couldn't find the module nor its routing module.`);
    }

    const sourceText = text.toString();

    const sourceFile = ts.createSourceFile(
      path,
      sourceText,
      ts.ScriptTarget.Latest,
      true
    );

    const changes = addToArray(
      sourceFile,
      path,
      "ROUTES",
      `{
        title: '${classified}',
        path: '/${dasherized}'
      }`
    ) as InsertChange;

    const recorder = host.beginUpdate(path);
    recorder.insertLeft(changes.pos, changes.toAdd);
    host.commitUpdate(recorder);

    return host;
  };
}

function getRoutingModulePath(
  host: Tree,
  modulePath: string
): Path | undefined {
  const routingModulePath = modulePath.endsWith(ROUTING_MODULE_EXT)
    ? modulePath
    : modulePath.replace(MODULE_EXT, ROUTING_MODULE_EXT);

  return host.exists(routingModulePath)
    ? normalize(routingModulePath)
    : undefined;
}

function buildRoute(options: ModuleOptions, modulePath: string) {
  const relativeModulePath = buildRelativeModulePath(options, modulePath);
  const moduleName = `${strings.classify(options.name)}Module`;
  const loadChildren = `() => import('${relativeModulePath}').then(m => m.${moduleName})`;
  const data = `{ title: 'Accessible ${strings.classify(options.name)}' }`;
  return `{ path: '${options.route}', data: ${data}, loadChildren: ${loadChildren} }`;
}

function addComponentLoadedToReducer(path: string, classified: string): Rule {
  return (host: Tree) => {
    const text = host.read(path);
    if (!text) {
      throw new Error(`Couldn't find the module nor its routing module.`);
    }
    const sourceText = text.toString();
    const sourceFile = ts.createSourceFile(
      path,
      sourceText,
      ts.ScriptTarget.Latest,
      true
    );
    const componentLoadedCase = getReducerComponentLoadedCase(
      sourceFile,
      "componentsReducer"
    );
    if (!componentLoadedCase || !ts.isCallExpression(componentLoadedCase)) {
      console.log("Wrong case");
      return;
    }
    const lastArgument =
      componentLoadedCase.arguments[componentLoadedCase.arguments.length - 1];
    const insertPos = lastArgument.pos;
    let moduleActionTypes = `${classified}ApiActions.componentsLoaded,`;
    const changes = new InsertChange(path, insertPos, moduleActionTypes);
    const recorder = host.beginUpdate(path);
    recorder.insertLeft(changes.pos, changes.toAdd);
    host.commitUpdate(recorder);
    return host;
  };
}

function addToggleComponentToReducer(path: string, classified: string): Rule {
  return (host: Tree) => {
    const text = host.read(path);
    if (!text) {
      throw new Error(`Couldn't find the module nor its routing module.`);
    }
    const sourceText = text.toString();
    const sourceFile = ts.createSourceFile(
      path,
      sourceText,
      ts.ScriptTarget.Latest,
      true
    );
    const toggleComponentCase = getReducerToggleComponentCase(
      sourceFile,
      "componentsReducer"
    );
    if (!toggleComponentCase || !ts.isCallExpression(toggleComponentCase)) {
      console.log("Wrong case");
      return;
    }
    const lastArgument =
      toggleComponentCase.arguments[toggleComponentCase.arguments.length - 1];
    const insertPos = lastArgument.pos;
    let moduleActionTypes = `${classified}PageActions.toggleComponent,`;
    const changes = new InsertChange(path, insertPos, moduleActionTypes);
    const recorder = host.beginUpdate(path);
    recorder.insertLeft(changes.pos, changes.toAdd);
    host.commitUpdate(recorder);
    return host;
  };
}

function buildActionsToImport(name: string) {
  return `
    ${name}ApiActions,
    ${name}PageActions,
    ${name}Actions
  `;
}

function addActionsImports(
  path: string,
  classified: string,
  dasherized: string
): Rule {
  return (host: Tree) => {
    const text = host.read(path);
    if (!text) {
      throw new Error(`Couldn't find the module nor its routing module.`);
    }
    const sourceText = text.toString();
    const sourceFile = ts.createSourceFile(
      path,
      sourceText,
      ts.ScriptTarget.Latest,
      true
    );
    const changes = insertImport(
      sourceFile,
      path,
      buildActionsToImport(classified),
      `src/app/${dasherized}/actions`
    ) as InsertChange;
    const recorder = host.beginUpdate(path);
    recorder.insertLeft(changes.pos, changes.toAdd);
    host.commitUpdate(recorder);
    return host;
  };
}

function addActionsTypesToDeclaration(path: string, classified: string): Rule {
  return (host: Tree) => {
    const text = host.read(path);
    if (!text) {
      throw new Error(`Couldn't find the module nor its routing module.`);
    }
    const sourceText = text.toString();
    const sourceFile = ts.createSourceFile(
      path,
      sourceText,
      ts.ScriptTarget.Latest,
      true
    );
    const changes = addNewTypeToReducer(
      sourceFile,
      path,
      "reducer",
      `${classified}Actions`
    ) as InsertChange;
    const recorder = host.beginUpdate(path);
    recorder.insertLeft(changes.pos, changes.toAdd);
    host.commitUpdate(recorder);
    return host;
  };
}

export default function(options: ModuleOptions): Rule {
  return async (host: Tree) => {
    if (options.path === undefined) {
      options.path = await createDefaultPath(host, options.project as string);
    }

    // Customizing options
    options.module = "app";
    options.route = options.name;
    options.routing = true;

    options.module = findModuleFromOptions(host, options);

    let routingModulePath: Path | undefined;
    const isLazyLoadedModuleGen = !!(options.route && options.module);
    if (isLazyLoadedModuleGen) {
      options.routingScope = RoutingScope.Child;
      routingModulePath = getRoutingModulePath(host, options.module as string);
    }

    const parsedPath = parseName(options.path, options.name);
    options.name = parsedPath.name;
    options.path = parsedPath.path;

    const templateSource = apply(url("./files"), [
      applyTemplates({
        ...strings,
        "if-flat": (s: string) => (options.flat ? "" : s),
        lazyRoute: isLazyLoadedModuleGen,
        lazyRouteWithoutRouteModule:
          isLazyLoadedModuleGen && !routingModulePath,
        lazyRouteWithRouteModule: isLazyLoadedModuleGen && !!routingModulePath,
        ...options
      }),
      move(parsedPath.path)
    ]);
    const moduleDasherized = strings.dasherize(options.name);
    const moduleClassified = strings.classify(options.name);
    const modulePath = `${
      !options.flat ? moduleDasherized + "/" : ""
    }${moduleDasherized}.module.ts`;
    const containerName = `${moduleDasherized}/page`;

    return chain([
      !isLazyLoadedModuleGen ? addDeclarationToNgModule(options) : noop(),
      addRouteDeclarationToNgModule(options, routingModulePath),
      addRouteToCoreRoutes(
        "src/app/core/consts/routes.const.ts",
        moduleClassified,
        moduleDasherized
      ),
      addComponentLoadedToReducer(
        "src/app/core/reducers/components.reducer.ts",
        moduleClassified
      ),
      addToggleComponentToReducer(
        "src/app/core/reducers/components.reducer.ts",
        moduleClassified
      ),
      addActionsImports(
        "src/app/core/reducers/components.reducer.ts",
        moduleClassified,
        moduleDasherized
      ),
      addActionsTypesToDeclaration(
        "src/app/core/reducers/components.reducer.ts",
        moduleClassified
      ),
      mergeWith(templateSource),
      schematic("container", {
        ...options,
        module: modulePath,
        parent: options.name,
        name: containerName
      }),
      schematic("actions", {
        ...options,
        path: parsedPath.path + "/" + moduleDasherized
      }),
      schematic("consts", {
        ...options,
        path: parsedPath.path + "/" + moduleDasherized
      }),
      schematic("effects", {
        ...options,
        path: parsedPath.path + "/" + moduleDasherized
      }),
      options.lintFix ? applyLintFix(options.path) : noop()
    ]);
  };
}
