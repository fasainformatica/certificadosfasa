"use client";

import { useId } from "react";
import { cn } from "@/lib/utils/cn";
import { Button } from "./button";
import { useQueryString } from "./url-state";
import type { SpecStyle } from "./shared";
import styles from "./spec.module.css";

export type FilterOption = { value: string; label: string };
export type FilterField = {
  name: string; label: string; defaultValue?: string;
} & ({ type?: "select"; options: readonly FilterOption[] } | { type: "date" });
export type FilterBarProps = {
  search?: { name?: string; label?: string; placeholder?: string; defaultValue?: string };
  filters?: readonly FilterField[];
  /** Server-rendered query string. Client navigation preserves unrelated query parameters. */
  query?: string;
  action?: string;
};

export function FilterBar({ search = {}, filters = [], query, action }: FilterBarProps) {
  const id = useId();
  const browserQuery = useQueryString();
  const currentQuery = browserQuery || query || "";
  const params = new URLSearchParams(currentQuery);
  const searchName = search.name ?? "busca";
  const names = new Set([searchName, ...filters.map((filter) => filter.name), "page"]);
  const currentValue = (name: string, fallback?: string) => params.get(name) ?? fallback ?? "";
  const hasActiveFilters = Boolean(currentValue(searchName, search.defaultValue)) || filters.some((filter) => {
    const defaultValue = filter.defaultValue ?? (filter.type === "date" ? "" : filter.options[0]?.value ?? "");
    return currentValue(filter.name, defaultValue) !== defaultValue;
  });
  const clearParams = new URLSearchParams(params);
  names.forEach((name) => clearParams.delete(name));
  const clearHref = `${action ?? ""}?${clearParams.toString()}`;

  return <form key={currentQuery} method="get" action={action} role="search" aria-label="Filtros" className={cn(styles.root, styles.filterBar)}>
    {[...params.entries()].filter(([name]) => !names.has(name)).map(([name, value], index) => <input key={`${name}-${index}`} type="hidden" name={name} value={value} />)}
    <div className={cn(styles.field, styles.searchField)}>
      <label className={styles.label} htmlFor={`${id}-search`}>{search.label ?? "Busca"}</label>
      <input id={`${id}-search`} className={styles.input} type="search" name={searchName} placeholder={search.placeholder} defaultValue={currentValue(searchName, search.defaultValue)} />
    </div>
    {filters.map((filter) => <div key={filter.name} className={cn(styles.field, styles.selectField)} style={{ "--spec-field-width": filter.type === "date" ? "200px" : `${Math.max(200, Math.max(...filter.options.map((option) => option.label.length)) * 8 + 48)}px` } as SpecStyle}>
      <label className={styles.label} htmlFor={`${id}-${filter.name}`}>{filter.label}</label>
      {filter.type === "date" ? <input type="date" id={`${id}-${filter.name}`} name={filter.name} className={styles.input} defaultValue={currentValue(filter.name, filter.defaultValue)} /> : <select id={`${id}-${filter.name}`} name={filter.name} className={styles.input} defaultValue={currentValue(filter.name, filter.defaultValue ?? filter.options[0]?.value)}>
        {filter.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>}
    </div>)}
    <div className={styles.filterActions}>
      <Button type="submit" variant="secondary" size="sm">Aplicar</Button>
      {hasActiveFilters && <a href={clearHref} className={cn(styles.root, styles.button)} data-variant="ghost" data-size="sm">Limpar filtros</a>}
    </div>
  </form>;
}
