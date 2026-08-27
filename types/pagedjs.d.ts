declare module "pagedjs" {
  export type PagedFlow = { total: number };

  export class Previewer {
    preview(
      content: HTMLElement | string,
      stylesheets: string[],
      renderTo: HTMLElement,
    ): Promise<PagedFlow>;
  }
}
