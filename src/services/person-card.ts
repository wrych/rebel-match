/** Who a member is on a card: never how to reach them (R-CONN-6). Sector and
 * company size are labels, not the stored keys; `rebelCell` is the cell's key,
 * its flag drawn by the client (R-PROF-9); `photo` is the photo's key, or null
 * without one (R-PROF-7). */
export interface PersonCard {
  memberId: string
  name: string
  jobTitle: string | null
  org: string | null
  sector: string | null
  companySize: string | null
  rebelCell: string | null
  photo: string | null
}
