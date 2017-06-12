/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import paths = require('vs/base/common/paths');
import { isEqualOrParent } from 'vs/platform/files/common/files';
import { isLinux } from 'vs/base/common/platform';
import Event, { Emitter } from 'vs/base/common/event';
import { IConfigurationService } from "vs/platform/configuration/common/configuration";
import { IDisposable, dispose } from "vs/base/common/lifecycle";

export const IWorkspaceContextService = createDecorator<IWorkspaceContextService>('contextService');

export interface IWorkspaceContextService {
	_serviceBrand: any;

	/**
	 * Returns iff the application was opened with a workspace or not.
	 */
	hasWorkspace(): boolean;

	/**
	 * Provides access to the workspace object the platform is running with. This may be null if the workbench was opened
	 * without workspace (empty);
	 */
	getWorkspace(): IWorkspace;

	/**
	 * Returns iff the provided resource is inside the workspace or not.
	 */
	isInsideWorkspace(resource: URI): boolean;

	/**
	 * Given a resource inside the workspace, returns its relative path from the workspace root
	 * without leading or trailing slashes. Returns null if the file is not inside an opened
	 * workspace.
	 */
	toWorkspaceRelativePath: (resource: URI, toOSPath?: boolean) => string;

	/**
	 * Given a workspace relative path, returns the resource with the absolute path.
	 */
	toResource: (workspaceRelativePath: string) => URI;

	/**
	 * TODO@multiroot
	 */
	getAdditionalFolders(): URI[];
	onDidChangeAdditionalFolders: Event<URI[]>;
}

export interface IWorkspace {

	/**
	 * the full uri of the workspace. this is a file:// URL to the location
	 * of the workspace on disk.
	 */
	resource: URI;

	/**
	 * the unique identifier of the workspace. if the workspace is deleted and recreated
	 * the identifier also changes. this makes the uid more unique compared to the id which
	 * is just derived from the workspace name.
	 */
	uid?: number;

	/**
	 * the name of the workspace
	 */
	name?: string;
}

interface IWorkspaceConfiguration {
	additionalFolders: { path: string; folders: string[]; }[];
}

export class Workspace implements IWorkspace {

	constructor(private _resource: URI, private _uid?: number, private _name?: string) {
	}

	public get resource(): URI {
		return this._resource;
	}

	public get uid(): number {
		return this._uid;
	}

	public get name(): string {
		return this._name;
	}

	public isInsideWorkspace(resource: URI): boolean {
		if (resource) {
			return isEqualOrParent(resource.fsPath, this._resource.fsPath, !isLinux /* ignorecase */);
		}

		return false;
	}

	public toWorkspaceRelativePath(resource: URI, toOSPath?: boolean): string {
		if (this.isInsideWorkspace(resource)) {
			return paths.normalize(paths.relative(this._resource.fsPath, resource.fsPath), toOSPath);
		}

		return null;
	}

	public toResource(workspaceRelativePath: string): URI {
		if (typeof workspaceRelativePath === 'string') {
			return URI.file(paths.join(this._resource.fsPath, workspaceRelativePath));
		}

		return null;
	}
}

export class WorkspaceContextService implements IWorkspaceContextService {

	public _serviceBrand: any;

	private _onDidChangeAdditionalFolders: Emitter<URI[]>;
	private additionalFolders: URI[];

	private toDispose: IDisposable[];

	constructor(private configurationService: IConfigurationService, private workspace?: Workspace) {
		this._onDidChangeAdditionalFolders = new Emitter<URI[]>();
		this.toDispose.push(this._onDidChangeAdditionalFolders);

		this.additionalFolders = [];

		this.resolveAdditionalFolders();

		this.registerListeners();
	}

	private registerListeners(): void {
		this.toDispose.push(this.configurationService.onDidUpdateConfiguration(e => this.onDidUpdateConfiguration()));
	}

	private onDidUpdateConfiguration(): void {
		this.resolveAdditionalFolders(true);
	}

	private resolveAdditionalFolders(notify?: boolean): void {
		if (!this.workspace) {
			return; // no additional folders for empty workspaces
		}

		const additionalFolders: URI[] = [];
		const config = this.configurationService.getConfiguration<IWorkspaceConfiguration>('workspace');
		if (typeof Array.isArray(config.additionalFolders)) {
			for (let i = 0; i < config.additionalFolders.length; i++) {
				const resource = config.additionalFolders[i];
				if (resource.path === this.workspace.resource.toString()) {
					additionalFolders.push(...resource.folders.map(f => URI.parse(f)));

					break;
				}
			}
		}

		let changed = this.additionalFolders.length !== additionalFolders.length;
		if (notify && !changed) {
			for (let i = 0; i < this.additionalFolders.length; i++) {
				for (let j = 0; j < additionalFolders.length; j++) {
					if (this.additionalFolders[i].toString() !== additionalFolders[j].toString()) {
						changed = true;
						break;
					}
				}
			}
		}

		this.additionalFolders = additionalFolders;

		if (notify && changed) {
			this._onDidChangeAdditionalFolders.fire(additionalFolders);
		}
	}

	public get onDidChangeAdditionalFolders(): Event<URI[]> {
		return this._onDidChangeAdditionalFolders.event;
	}

	public getAdditionalFolders(): URI[] {
		return this.additionalFolders;
	}

	public getWorkspace(): IWorkspace {
		return this.workspace;
	}

	public hasWorkspace(): boolean {
		return !!this.workspace;
	}

	public isInsideWorkspace(resource: URI): boolean {
		return this.workspace ? this.workspace.isInsideWorkspace(resource) : false;
	}

	public toWorkspaceRelativePath(resource: URI, toOSPath?: boolean): string {
		return this.workspace ? this.workspace.toWorkspaceRelativePath(resource, toOSPath) : null;
	}

	public toResource(workspaceRelativePath: string): URI {
		return this.workspace ? this.workspace.toResource(workspaceRelativePath) : null;
	}

	public dispose(): void {
		dispose(this.toDispose);
	}
}