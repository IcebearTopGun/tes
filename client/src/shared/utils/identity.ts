export function getInitials(name: string): string {
  return name
    .split(" ")
    .map((word) => word[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function getFirstName(name: string): string {
  return name.split(" ")[0] || name;
}
